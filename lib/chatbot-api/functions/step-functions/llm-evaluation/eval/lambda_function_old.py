from datetime import datetime
import json
import boto3
import os
import csv
import io
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from botocore.exceptions import ClientError
import asyncio

#from langchain_community.chat_models import BedrockChat
from langchain_aws import ChatBedrock as BedrockChat
#from langchain_community.embeddings import BedrockEmbeddings
from langchain_aws import BedrockEmbeddings
#from langchain.chat_models import ChatBedrock as BedrockChat
#from langchain.embeddings import BedrockEmbeddings

GENERATE_RESPONSE_LAMBDA_NAME = os.environ['GENERATE_RESPONSE_LAMBDA_NAME']
BEDROCK_MODEL_ID = os.environ['BEDROCK_MODEL_ID']

# Initialize clients outside the loop
s3_client = boto3.client('s3')
lambda_client = boto3.client('lambda')

def lambda_handler(event, context): 
    print("in the handler function")
    try:  
        print("event: ", event)
        # pull test cases chunk from event
        # test_cases = event["test_cases_chunk"]
        print("test_cases: ", event)

        # Arrays to collect results
        detailed_results = []
        total_similarity = 0
        total_relevance = 0
        total_correctness = 0
        # num_test_cases = len(test_cases)
        num_test_cases = len(event)


        # Process each test case
        for test_case in event:
            print("test_case: ", test_case)
            question = test_case['question']
            expected_response = test_case['expectedResponse']

            # Invoke generateResponseLambda to get the actual response
            actual_response = invoke_generate_response_lambda(lambda_client, question)

            # Evaluate the response using RAGAS
            response = evaluate_with_ragas(question, expected_response, actual_response)
            print("response: ", response)
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

        partial_results = {
            "detailed_results": detailed_results,
            "total_similarity": total_similarity,
            "total_relevance": total_relevance,
            "total_correctness": total_correctness, 
            "num_test_cases": num_test_cases,
        }
        # return {
        #     "partial_results": partial_results,
        # }
        return partial_results
        
    except Exception as e:
        logging.error(f"Error in evaluation Lambda: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
            }),
        }

async def process_test_case(lambda_client, test_case):
    try:
        question = test_case['question']
        expected_response = test_case['expectedResponse']

        # Invoke generate response Lambda
        actual_response = invoke_generate_response_lambda(lambda_client, question)

        # Evaluate with RAGAS
        result = evaluate_with_ragas(question, expected_response, actual_response)
        if result['status'] == 'error':
            return None

        return {
            'question': question,
            'expectedResponse': expected_response,
            'actualResponse': actual_response,
            'similarity': result['scores']['similarity'],
            'relevance': result['scores']['relevance'],
            'correctness': result['scores']['correctness'],
        }
    except Exception as e:
        logging.error(f"Error processing test case: {e}")
        return None
    
async def process_all_test_cases(test_cases, lambda_client):
    tasks = [process_test_case(lambda_client, test_case) for test_case in test_cases]
    return await asyncio.gather(*tasks)

def invoke_generate_response_lambda(lambda_client, question):
    try:
        response = lambda_client.invoke(
            FunctionName=GENERATE_RESPONSE_LAMBDA_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps({'userMessage': question, 'chatHistory': []}),
        )
        print("response: ", response["Payload"])
        payload = response['Payload'].read().decode('utf-8')
        result = json.loads(payload)
        print("result: ", result)
        body = json.loads(result.get('body', {}))
        print("body: ", body)
        return body.get('modelResponse', '')
    except Exception as e:
        logging.error(f"Error invoking generateResponseLambda: {str(e)}")
        return ""

def evaluate_with_ragas(question, expected_response, actual_response):
    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import answer_correctness, answer_similarity, answer_relevancy
        metrics = [answer_correctness, answer_similarity, answer_relevancy]

        # Prepare data for RAGAS
        data_sample = {
            "question": [question],
            "answer": [actual_response],
            "reference": [expected_response],
            "retrieved_contexts": [[expected_response]]
        }
        data_samples = Dataset.from_dict(data_sample)

        # Load LLM and embeddings
        region_name = 'us-east-1'
        bedrock_model = BedrockChat(region_name=region_name, endpoint_url=f"https://bedrock-runtime.{region_name}.amazonaws.com", model_id=BEDROCK_MODEL_ID)
        bedrock_embeddings = BedrockEmbeddings(region_name=region_name, model_id='amazon.titan-embed-text-v1')

        # Evaluate
        result = evaluate(data_samples, metrics=metrics, llm=bedrock_model, embeddings=bedrock_embeddings)
        scores = result.to_pandas().iloc[0]
        
        return {"status": "success", "scores": {"similarity": scores['semantic_similarity'], "relevance": scores['answer_relevancy'], "correctness": scores['answer_correctness']}}
    except Exception as e:
        logging.error(f"Error in RAGAS evaluation: {str(e)}")
        return {"status": "error", "error": str(e)}
