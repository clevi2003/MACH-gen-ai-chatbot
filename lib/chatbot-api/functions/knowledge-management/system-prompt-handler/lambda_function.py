import os
import boto3
from botocore.exceptions import ClientError
import json
from datetime import datetime
from decimal import Decimal
import uuid

# Retrieve DynamoDB table names from environment variables
SYSTEM_PROMPTS_TABLE = os.environ["SYSTEM_PROMPTS_TABLE"]

# Initialize a DynamoDB resource using boto3
dynamodb = boto3.resource("dynamodb", region_name='us-east-1')

# Connect to the specified DynamoDB tables
prompts_table = dynamodb.Table(SYSTEM_PROMPTS_TABLE)


    
# function to retrieve most recent prompt from DynamoDB
def get_active_prompt():
    try:
        response = prompts_table.scan(
            Limit=1,
            FilterExpression='attribute_exists(prompt_id)',
            ProjectionExpression='prompt_id, prompt, timestamp',
            ScanIndexForward=False
        )
        items = response.get('Items', [])
        if len(items) > 0:
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(items[0])
            }
        else:
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('No active prompt found!')
            }
    except ClientError as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Error getting active prompt: {e}')
        }
    
# function to retrieve prompts from DynamoDB sorted by timestamp
def get_prompts(continuation_token, limit):
    try:
        response = prompts_table.scan(
            Limit=limit,
            ExclusiveStartKey=continuation_token,
            FilterExpression='attribute_exists(prompt_id)',
            ProjectionExpression='prompt_id, prompt, timestamp',
            ScanIndexForward=False
        )
        items = response.get('Items', [])
        next_continuation_token = response.get('LastEvaluatedKey', None)
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'prompts': items, 'continuation_token': next_continuation_token})
        }
    except ClientError as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Error getting prompts: {e}')
        }
    
# function to set a new prompt in DynamoDB
def set_prompt(prompt, timestamp):
    try:
        prompt_id = str(uuid.uuid4())
        response = prompts_table.put_item(
            Item={
                'prompt_id': prompt_id,
                'prompt': prompt,
                'timestamp': timestamp
            }
        )
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps('Prompt set successfully!')
        }
    except ClientError as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Error setting prompt: {e}')
        }

    
def lambda_handler(event, context):
    data = json.loads(event['body']) if 'body' in event else event
    operation = data.get('operation')
    prompt = data.get('prompt')
    continuation_token = data.get('continuation_token')
    limit = data.get('limit', 10)
    timestamp = str(datetime.now())

    if operation == 'get_active_prompt':
        return get_active_prompt()
    elif operation == 'get_prompts':
        return get_prompts(continuation_token, limit)
    elif operation == 'set_prompt':
        return set_prompt(prompt, timestamp)
    else:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Operation not found/allowed! Operation Sent: {operation}')
        }