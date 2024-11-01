import json
import boto3
import os
import csv
import io
import uuid
import logging
from botocore.exceptions import ClientError

# RAGAS imports
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import answer_correctness, answer_similarity, answer_relevancy

# Bedrock imports
from langchain_community.chat_models import BedrockChat
from langchain_community.embeddings import BedrockEmbeddings

TEST_CASE_BUCKET = os.environ['TEST_CASES_BUCKET']
RESULTS_BUCKET = os.environ['RESULTS_BUCKET']

def lambda_handler(event, context):
    try:
        s3_client = boto3.client('s3')
        lambda_client = boto3.client('lambda')

        # Get the test cases file URI from the event
        test_cases_key = event.get('testCasesKey')
        if not test_cases_key:
            raise ValueError("testCasesUri parameter is required in the event.")

        # Parse S3 bucket and key from the URI
        # bucket_name, key = parse_s3_uri(test_cases_uri)   

        # Read the test cases from S3
        test_cases = read_test_cases_from_s3(s3_client, TEST_CASE_BUCKET, test_cases_key)

        # Arrays to collect results
        detailed_results = []
        total_similarity = 0
        total_relevance = 0
        total_correctness = 0
        num_test_cases = len(test_cases)

        # Process each test case
        for test_case in test_cases:
            question = test_case['question']
            expected_response = test_case['expectedResponse']

            # Invoke generateResponseLambda to get the actual response
            actual_response = invoke_generate_response_lambda(question)

            # Evaluate the response using RAGAS
            response = evaluate_with_ragas(question, expected_response, actual_response)
            if response['status'] == 'error':
                continue
            else:
                similarity = response['scores']['similarity']
                relevance = response['scores']['relevance']
                correctness = response['scores']['correctness']
            
            # Collect results
            detailed_results.append({
                'question': question,
                'expectedResponse': expected_response,
                'actualResponse': actual_response,
                'similarity': similarity,
                'relevance': relevance,
                'correctness': correctness,
            })

            total_similarity += similarity
            total_relevance += relevance
            total_correctness += correctness

        # Compute average scores
        average_similarity = total_similarity / num_test_cases if num_test_cases > 0 else 0
        average_relevance = total_relevance / num_test_cases if num_test_cases > 0 else 0
        average_correctness = total_correctness / num_test_cases if num_test_cases > 0 else 0

        # Save the detailed results to S3
        timestamp = uuid.uuid4().hex
        detailed_results_key = f'evaluation_results/detailed_results_{timestamp}.csv'
        save_results_to_s3_csv(s3_client, RESULTS_BUCKET, detailed_results_key, detailed_results)

        # Save the summary results to S3
        summary_results = {
            'averageSimilarity': average_similarity,
            'averageRelevance': average_relevance,
            'averageCorrectness': average_correctness,
        }
        summary_results_key = f'evaluation_results/summary_results_{timestamp}.csv'
        save_summary_to_s3_csv(s3_client, RESULTS_BUCKET, summary_results_key, summary_results)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Evaluation completed successfully.',
                'detailedResultsKey': detailed_results_key,
                'summaryResultsKey': summary_results_key,
            }),
        }
    except Exception as e:
        logging.error(f"Error in evaluation Lambda: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
            }),
        }
    
def parse_s3_uri(s3_uri):
    if s3_uri.startswith('s3://'):
        s3_uri = s3_uri[5:]
    else:
        raise ValueError("Invalid S3 URI")

    bucket_name, _, key = s3_uri.partition('/')
    return bucket_name, key

def read_test_cases_from_s3(s3_client, bucket_name, key):
    try:
        response = s3_client.get_object(Bucket=bucket_name, Key=key)
        content = response['Body'].read().decode('utf-8')
        test_cases = []

        # Assuming the CSV has headers 'question' and 'expectedResponse'
        reader = csv.DictReader(io.StringIO(content))
        for row in reader:
            test_cases.append({
                'question': row['question'],
                'expectedResponse': row['expectedResponse'],
            })
        return test_cases
    except ClientError as e:
        logging.error(e)
        raise e

def invoke_generate_response_lambda(lambda_client, question):
    try:
        response = lambda_client.invoke(
            FunctionName=os.environ['GENERATE_RESPONSE_LAMBDA_NAME'],
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'userMessage': question,
                'chatHistory': [],  # Empty chat history for each test case
            }),
        )
        payload = response['Payload'].read().decode('utf-8')
        result = json.loads(payload)

        if 'errorMessage' in result:
            logging.error(f"Error from generateResponseLambda: {result['errorMessage']}")
            return ""
        else:
            body = json.loads(result.get('body', '{}'))
            return body.get('modelResponse', '')
    except Exception as e:
        logging.error(f"Error invoking generateResponseLambda: {str(e)}")
        return ""
    
def save_results_to_s3_csv(s3_client, bucket_name, key, data):
    try:
        # Write data to CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=['question', 'expectedResponse', 'actualResponse', 'similarity', 'relevance', 'correctness'])
        writer.writeheader()
        for row in data:
            writer.writerow(row)

        # Upload to S3
        s3_client.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=output.getvalue(),
            ContentType='text/csv'
        )
    except ClientError as e:
        logging.error(e)
        raise e

def save_summary_to_s3_csv(s3_client, bucket_name, key, summary):
    try:
        # Write summary to CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=['averageSimilarity', 'averageRelevance', 'averageCorrectness'])
        writer.writeheader()
        writer.writerow(summary)

        # Upload to S3
        s3_client.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=output.getvalue(),
            ContentType='text/csv'
        )
    except ClientError as e:
        logging.error(e)
        raise e
    
def evaluate_with_ragas(question, expected_response, actual_response):
    try:
        # Metrics to evaluate
        metrics = [answer_correctness, answer_similarity, answer_relevancy]

        # Prepare the data sample
        data_sample = {
            "question": [question],
            "answer": [actual_response],
            "reference": [expected_response],
            "retrieved_contexts": [[expected_response]]  # Assuming expected response as context
        }

        data_samples = Dataset.from_dict(data_sample)

        # Load the LLM and embeddings
        region_name = 'us-east-1'
        model_id = os.environ.get('BEDROCK_MODEL_ID')

        bedrock_model = BedrockChat(
            region_name=region_name,
            endpoint_url=f"https://bedrock-runtime.{region_name}.amazonaws.com",
            model_id=model_id,
            model_kwargs={},
        )

        bedrock_embeddings = BedrockEmbeddings(
            region_name=region_name,
        )

        # Evaluate sample
        result = evaluate(
            data_samples,
            metrics=metrics,
            llm=bedrock_model,
            embeddings=bedrock_embeddings,
        )

        # Get the scores from the result
        scores = result.to_pandas().iloc[0]
        similarity = scores['answer_similarity']
        relevance = scores['answer_relevancy']
        correctness = scores['answer_correctness']

        return {
            "status": "success",
            "scores": {
                "similarity": similarity,
                "relevance": relevance,
                "correctness": correctness
            }
        }
    except Exception as e:
        logging.error(f"Error in RAGAS evaluation: {str(e)}")
        return {
            "status": "error",
            "error": str(e)
        }

