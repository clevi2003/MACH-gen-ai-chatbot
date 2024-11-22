import os
import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
import json
from datetime import datetime
from decimal import Decimal
import uuid
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Retrieve DynamoDB table names from environment variables
STAGED_SYS_PROMPTS_TABLE = os.environ["STAGED_SYSTEM_PROMPTS_TABLE"]
ACTIVE_SYS_PROMPTS_TABLE = os.environ["ACTIVE_SYSTEM_PROMPTS_TABLE"]

# Initialize a DynamoDB resource using boto3
dynamodb = boto3.resource("dynamodb", region_name='us-east-1')

# Connect to the specified DynamoDB tables
staged_prompts_table = dynamodb.Table(STAGED_SYS_PROMPTS_TABLE)
active_prompts_table = dynamodb.Table(ACTIVE_SYS_PROMPTS_TABLE)


    
# function to retrieve most recent prompt from DynamoDB
def get_active_prompt():
    try:
        response = active_prompts_table.query(
            KeyConditionExpression=Key('PartitionKey').eq('Prompt'),
            ProjectionExpression='#pid, #p, #ts',
            ExpressionAttributeNames={
                '#pid': 'PromptId',  
                '#p': 'Prompt',     
                '#ts': 'Timestamp'  
            },
            ScanIndexForward=False,  # Sort in descending order
            Limit=1  # Retrieve the most recent prompt
        )
        items = response.get('Items', [])
        if len(items) > 0:
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(items[0])
            }
        else:
            print('No prompt available, using default prompt')
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(os.environ.get('DEFAULT_PROMPT', 'No prompt available'))
            }
    except ClientError as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Error getting active prompt: {e}')
        }
    
# function to retrieve prompts from DynamoDB sorted by timestamp
def get_prompts(continuation_token, limit, table):
    try:
        query_params = {
            "KeyConditionExpression": Key("PartitionKey").eq("Prompt"),
            "ProjectionExpression": "#pid, #p, #ts",
            "ExpressionAttributeNames": {
                "#pid": "PromptId",
                "#p": "Prompt",
                "#ts": "Timestamp" 
            },
            "Limit": limit,
            "ScanIndexForward": False  # Sort in descending order
        }

        # Add ExclusiveStartKey only if continuation_token is not None
        if continuation_token:
            query_params["ExclusiveStartKey"] = continuation_token

        response = table.query(**query_params)
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
def add_prompt(prompt, timestamp, table):
    try:
        prompt_id = str(uuid.uuid4())
        response = table.put_item(
            Item={
                'PartitionKey': 'Prompt',
                'Timestamp': timestamp,
                'PromptId': prompt_id,
                'Prompt': prompt
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
        
def stage_prompt(prompt, timestamp):
    return add_prompt(prompt, timestamp, staged_prompts_table)

def set_prompt(prompt, timestamp):
    return add_prompt(prompt, timestamp, active_prompts_table)

def get_active_prompts(continuation_token, limit):
    return get_prompts(continuation_token, limit, active_prompts_table)

def get_staged_prompts(continuation_token, limit):
    return get_prompts(continuation_token, limit, staged_prompts_table)

    
def lambda_handler(event, context):
    print(f'Event: {event}')
    data = json.loads(event['body']) if 'body' in event else event
    operation = data.get('operation')
    prompt = data.get('prompt')
    continuation_token = data.get('continuation_token')
    limit = data.get('limit', 10)
    timestamp = str(datetime.now())

    if operation == 'get_active_prompt':
        return get_active_prompt()
    elif operation == 'get_staged_prompts':
        return get_staged_prompts(continuation_token, limit)
    elif operation == 'get_active_prompts':
        return get_active_prompts(continuation_token, limit)
    elif operation == 'set_prompt':
        return set_prompt(prompt, timestamp)
    elif operation == 'stage_prompt':
        return stage_prompt(prompt, timestamp)
    else:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(f'Operation not found/allowed! Operation Sent: {operation}')
        }