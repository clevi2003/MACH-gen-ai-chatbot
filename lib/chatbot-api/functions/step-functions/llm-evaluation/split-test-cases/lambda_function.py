import boto3
import csv
import io
import os
import uuid
from datetime import datetime

TEST_CASE_BUCKET = os.environ['TEST_CASES_BUCKET']

def lambda_handler(event, context):
    s3_client = boto3.client('s3')
    test_cases_key = event.get('testCasesKey')
    if not test_cases_key:
        raise ValueError("testCasesKey parameter is required in the event.")
    
    print("event: ", event)
    eval_name = event.get('evalName')
    print("eval_name: ", eval_name)
    if not eval_name:
        eval_name = f"Evaluation on {str(datetime.now())}"
    
    # Read test cases from S3 
    test_cases = read_test_cases_from_s3(s3_client, TEST_CASE_BUCKET, test_cases_key)
    
    # Split into chunks
    chunk_size = 50  # Adjust based on testing
    chunks = [test_cases[i:i + chunk_size] for i in range(0, len(test_cases), chunk_size)]
    
    return {
        'chunks': chunks,
        'evaluation_id': str(uuid.uuid4()),
        'evaluation_name': eval_name,
        'test_cases_key': test_cases_key
    }

def read_test_cases_from_s3(s3_client, bucket_name, key):
    response = s3_client.get_object(Bucket=bucket_name, Key=key)
    content = response['Body'].read().decode('utf-8')
    test_cases = []
    reader = csv.DictReader(io.StringIO(content))
    for row in reader:
        test_cases.append({
            'question': row['question'],
            'expectedResponse': row['expectedResponse'],
        })
    return test_cases
