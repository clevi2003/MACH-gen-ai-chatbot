import os
import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
import json
from datetime import datetime
from decimal import Decimal

# Retrieve DynamoDB table names from environment variables
EVALUATION_SUMMARIES_TABLE = os.environ["EVALUATION_SUMMARIES_TABLE"]
EVALUATION_RESULTS_TABLE = os.environ["EVALUATION_RESULTS_TABLE"]

# Initialize a DynamoDB resource using boto3
dynamodb = boto3.resource("dynamodb", region_name='us-east-1')

# Connect to the specified DynamoDB tables
summaries_table = dynamodb.Table(EVALUATION_SUMMARIES_TABLE)
results_table = dynamodb.Table(EVALUATION_RESULTS_TABLE)

def convert_from_decimal(item):
    if isinstance(item, list):
        return [convert_from_decimal(i) for i in item]
    elif isinstance(item, dict):
        return {k: convert_from_decimal(v) for k, v in item.items()}
    elif isinstance(item, Decimal):
        return float(item)  # Convert Decimal to float
    else:
        return item
    
# function to retrieve all summaries from DynamoDB
def get_evaluation_summaries(continuation_token=None, limit=10, test_case_file_name=None):
    try: 
        query_params = {
            "KeyConditionExpression": Key("PartitionKey").eq("Evaluation"),  # Match all evaluations
            "ProjectionExpression": "#eid, #ts, #as, #ar, #ac, #tq, #en, #tk",
            "ExpressionAttributeNames": {
                "#eid": "EvaluationId",
                "#ts": "Timestamp",  # Reserved keyword
                "#as": "average_similarity",
                "#ar": "average_relevance",
                "#ac": "average_correctness",
                "#tq": "total_questions",
                "#en": "evaluation_name",
                "#tk": "test_cases_key"
            },
            "Limit": limit,
            "ScanIndexForward": False  # Get the most recent evaluations first
        }

        # Add continuation token if provided
        if continuation_token:
            query_params["ExclusiveStartKey"] = continuation_token

        # If test_case_file_name is provided, add a FilterExpression
        if test_case_file_name:
            query_params["FilterExpression"] = Key("test_cases_key").eq(test_case_file_name)

        # Query the DynamoDB table
        response = summaries_table.query(**query_params)
        items = response.get('Items', [])
        last_evaluated_key = response.get('LastEvaluatedKey')

        # Convert Decimal types to floats
        items = convert_from_decimal(items)

        # Build the response body
        response_body = {
            'Items': items,
            'NextPageToken': last_evaluated_key
        }

        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(response_body)
        }
    except ClientError as error:
        print("Caught error: DynamoDB error - could not retrieve evaluation summaries")
        print("error: ", error)
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(str(error))
        }
    
# function to retrieve detailed results for a specific evaluation from DynamoDB
def get_evaluation_results(evaluation_id, continuation_token=None, limit=10):
    try:
        query_params = {
            'KeyConditionExpression': boto3.dynamodb.conditions.Key('EvaluationId').eq(evaluation_id),
            'Limit': limit
        }
        if continuation_token:
            query_params['ExclusiveStartKey'] = continuation_token
        
        # Query the results table for the given evaluation_id
        response = results_table.query(**query_params)
        print("response from eval handler: ", response)
        items = response.get('Items', [])
        last_evaluated_key = response.get('LastEvaluatedKey')

        # Sort items by QuestionId and build response body
        sorted_items = sorted(items, key=lambda x: int(x['QuestionId']))
        response_body = {
            'Items': convert_from_decimal(sorted_items),
            'NextPageToken': last_evaluated_key
        }

        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(response_body)
        }
    except ClientError as error:
        print("Caught error: DynamoDB error - could not retrieve evaluation results")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(str(error))
        }
    
def lambda_handler(event, context):
    data = json.loads(event['body']) if 'body' in event else event
    operation = data.get('operation')
    evaluation_id = data.get('evaluation_id')
    continuation_token = data.get('continuation_token')
    limit = data.get('limit', 10)
    test_case_file_name = data.get('test_case_file_name')

    if operation == 'get_evaluation_summaries':
        return get_evaluation_summaries(continuation_token, limit, test_case_file_name)
    elif operation == 'get_evaluation_results':
        if not evaluation_id:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('evaluation_id is required for retrieving evaluation results.')
            }
        return get_evaluation_results(evaluation_id, continuation_token, limit)
    else:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Operation not found/allowed! Operation Sent: {operation}')
        }