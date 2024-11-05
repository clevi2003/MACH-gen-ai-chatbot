from datetime import datetime
import json
import boto3
import os
import csv
import io
import uuid
import logging
from botocore.exceptions import ClientError

# Bedrock imports
#from langchain_community.chat_models import BedrockChat
from langchain_aws import ChatBedrock as BedrockChat
#from langchain_community.embeddings import BedrockEmbeddings
from langchain_aws import BedrockEmbeddings
#from langchain.chat_models import ChatBedrock as BedrockChat
#from langchain.embeddings import BedrockEmbeddings

TEST_CASE_BUCKET = os.environ['TEST_CASES_BUCKET']
EVAL_RESULTS_HANDLER_LAMBDA_NAME = os.environ['EVAL_RESULTS_HANDLER_LAMBDA_NAME']
GENERATE_RESPONSE_LAMBDA_NAME = os.environ['GENERATE_RESPONSE_LAMBDA_NAME']
BEDROCK_MODEL_ID = os.environ['BEDROCK_MODEL_ID']
EVAL_RESULTS_HANDLER_LAMBDA_NAME = os.environ['EVAL_RESULTS_HANDLER_LAMBDA_NAME']

def lambda_handler(event, context): 
    print("in the handler function")
    try:
        print("in the try block")
        s3_client = boto3.client('s3')
        lambda_client = boto3.client('lambda')

        # Get the test cases file URI from the event
        test_cases_key = event.get('testCasesKey')
        if not test_cases_key:
            raise ValueError("testCasesKey parameter is required in the event.")

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
            actual_response = invoke_generate_response_lambda(lambda_client, question)

            # Evaluate the response using RAGAS
            response = evaluate_with_ragas(question, expected_response, actual_response)
            if response['status'] == 'error':
                print("error status going to next iteration")
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

        # Build the payload for the eval-results-handler Lambda
        evaluation_id = str(uuid.uuid4())
        timestamp = str(datetime.now())
        evaluation_name = f"Evaluation on {timestamp}"

        payload = {
            'operation': 'add_evaluation',
            'evaluation_id': evaluation_id,
            'evaluation_name': evaluation_name,
            'average_similarity': average_similarity,
            'average_relevance': average_relevance,
            'average_correctness': average_correctness,
            'total_questions': num_test_cases,
            'detailed_results': detailed_results
        }
        print("save eval payload: ", payload)

        # Invoke the eval-results-handler Lambda
        response = lambda_client.invoke(
            FunctionName=EVAL_RESULTS_HANDLER_LAMBDA_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload),
        )

        # Process the response
        response_payload = response['Payload'].read().decode('utf-8')
        result = json.loads(response_payload)

        if 'statusCode' in result and result['statusCode'] == 200:
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Evaluation completed and results saved successfully.',
                    'evaluation_id': evaluation_id
                }),
            }
        else:
            error_message = result.get('body', 'Unknown error occurred.')
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': f"Error saving evaluation results: {error_message}"
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
    
def evaluate_with_ragas(question, expected_response, actual_response):
    try:
        # move large imports here to avoid global imports that can timeout initialization
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import answer_correctness, answer_similarity, answer_relevancy
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

        bedrock_model = BedrockChat(
            region_name=region_name,
            endpoint_url=f"https://bedrock-runtime.{region_name}.amazonaws.com",
            model_id=BEDROCK_MODEL_ID,
            model_kwargs={},
        )

        bedrock_embeddings = BedrockEmbeddings(
            region_name=region_name,
            model_id='amazon.titan-embed-text-v1',
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
        print("scores: ", scores)
        similarity = scores['semantic_similarity']
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
        print(e)
        logging.error(f"Error in RAGAS evaluation: {str(e)}")
        return {
            "status": "error",
            "error": str(e)
        } 