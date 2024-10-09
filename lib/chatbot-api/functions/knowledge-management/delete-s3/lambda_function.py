import json
import boto3
import os


def lambda_handler(event, context):
    payload = json.loads(event['body'])
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        roles = json.loads(claims['custom:role'])
        institutions = json.loads(claims['custom:institution'])
        if "MasterAdmin" in roles:                        
            print("admin granted!")
        elif "Admin" in roles:
            institution = institutions[0]
            allowed_prefixes = [f"archive/{institution}/", f"raw/{institution}/", f"processed/{institution}/", f"current/{institution}/"]
            if not any(payload['KEY'].startswith(prefix) for prefix in allowed_prefixes):
                return {
                    'statusCode': 403,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps('User is not authorized to perform this action')
                }
        else:
            return {
                'statusCode': 403,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('User is not authorized to perform this action')
            }
    except:
        return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps('Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute.')
            }

    try:
        s3 = boto3.resource('s3')
        return s3.Object(os.environ['BUCKET'], payload['KEY']).delete()
    except:

        return {
            'statusCode': 502,
            'body': json.dumps('FAILED')
        }
