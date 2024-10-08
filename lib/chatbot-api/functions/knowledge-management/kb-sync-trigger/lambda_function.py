import boto3
import os
import json

def lambda_handler(event, context):
    # Initialize Lambda client
    lambda_client = boto3.client('lambda')

    # Get the sync function name from environment variables
    sync_function_name = os.environ['SYNC_FUNCTION_NAME']

    # Construct the event expected by the sync function
    sync_event = {
        'rawPath': '/sync-kb',
        'requestContext': {
            'authorizer': {
                'jwt': {
                    'claims': {
                        'custom:role': json.dumps(['Admin'])
                    }
                }
            }
        }
    }

    # Invoke the sync function asynchronously
    response = lambda_client.invoke(
        FunctionName=sync_function_name,
        InvocationType='Event',  # Asynchronous invocation
        Payload=json.dumps(sync_event)
    )

    print("Triggered sync function:", sync_function_name)

    return {
        'statusCode': 200,
        'body': json.dumps('Sync function triggered.')
    }
