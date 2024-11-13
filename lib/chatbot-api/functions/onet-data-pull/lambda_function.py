import boto3
import os
import json
import requests
import xml.etree.ElementTree as ET
from requests.auth import HTTPBasicAuth
import re
import logging

# setup logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    # Initialize AWS clients
    s3 = boto3.client('s3')
    secrets_manager = boto3.client('secretsmanager')
    
    # Retrieve API credentials from Secrets Manager
    secret_name = os.environ['SECRET_NAME']
    secret_response = secrets_manager.get_secret_value(SecretId=secret_name)
    secrets = json.loads(secret_response['SecretString'])
    username = secrets['username']
    password = secrets['password']
    
    # Define S3 parameters
    bucket_name = os.environ['BUCKET']
    # get next version number for the key
    version = get_next_version(s3, bucket_name, 'processed/onet_career_data/', r'occupations_overview_v(\d+)\.json')
    s3_key_versioned = f'processed/onet_career_data/occupations_overview_v{version}.txt'
    s3_key_current = 'current/onet_career_data/occupations_overview.txt'

    # Define O*NET API parameters
    base_url = 'https://services.onetcenter.org/ws/'
    endpoint = 'mnm/careers'

    start = 1
    end = 100
    total_records = None
    all_careers = ""

    while True:
        params = {
            'start': start,
            'end': end,
            'content': 'skills,abilities,knowledge,work_styles',
            # 'format': 'json'  # Remove this since the API returns XML
        }

        response = requests.get(
            url=f"{base_url}{endpoint}",
            params=params,
            auth=HTTPBasicAuth(username, password)
        )

        if response.status_code == 200:
            # Parse XML response
            root = ET.fromstring(response.content)

            # Extract total records
            if total_records is None:
                total_records = int(root.attrib['total'])

            # Iterate over each career element
            for career in root.findall('career'):
                career_str = career.find('title').text
                tags = career.find('tags').attrib
                outlook = tags['bright_outlook']
                if outlook: 
                    outlook = "have a bright outlook."
                else:
                    outlook = "do not have a bright outlook."
                career_href = career.attrib['href']
                detailed_data = fetch_career_details(career_href, username, password)
                if detailed_data['status_code'] != 200:
                    return detailed_data
                career_str += ", also known as " + ", ".join(detailed_data['also_called']) + ", " + outlook
                # career_str += " People in this career do the following: " + ";".join(detailed_data['what_they_do'])
                career_str += " People in this career do the following: " + detailed_data['what_they_do']
                career_str += " People in this career typically perform the following on the job tasks: " + ";".join(detailed_data['on_the_job_tasks'])

                all_careers += career_str + "\n"

            # Update start and end for next iteration
            start = end + 1
            end = start + 99  # Adjust the batch size as needed

            # Check if we've retrieved all records
            if start > total_records:
                break
        else:
            # Log error
            logger.error(f"Error: {response.status_code} - {response.text}")
            return {
                'statusCode': 500,
                'body': json.dumps('Error fetching O*NET data.')
            }
    # save versioned data in processed folder and most recent in current folder
    save_to_s3(s3, bucket_name, s3_key_versioned, all_careers)
    save_to_s3(s3, bucket_name, s3_key_current, all_careers)

    return {
        'statusCode': 200,
        'body': json.dumps('O*NET data pull completed.')
    }


def save_to_s3(s3, bucket_name, s3_key, data):
    s3.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=json.dumps(data),
        ContentType='application/json'
    )


def fetch_career_details(career_href, username, password):
    response = requests.get(
        url=career_href,
        auth=HTTPBasicAuth(username, password)
    )

    if response.status_code == 200:
        # Parse the XML response
        root = ET.fromstring(response.content)

        detailed_data = {}
        detailed_data["status_code"] = response.status_code

        # Extract 'also_called' titles
        also_called = [title.text for title in root.findall('also_called/title')]
        detailed_data['also_called'] = also_called

        # Extract 'what_they_do'
        what_they_do = root.find('what_they_do').text
        detailed_data['what_they_do'] = what_they_do

        # Extract 'on_the_job' tasks
        tasks = [task.text for task in root.findall('on_the_job/task')]
        detailed_data['on_the_job_tasks'] = tasks

        return detailed_data
    else:
        logger.error(f"Error fetching details for {career_href}: {response.status_code}")
        return {
                'statusCode': 500,
                'body': json.dumps('Error fetching O*NET data.')
            }
    
    
def get_next_version(s3, bucket_name, prefix, pattern):
    # List objects in the 'onet_career_data/' folder
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)

    version = 1

    if 'Contents' in response:
        # Extract version numbers from object keys
        versions = []
        for obj in response['Contents']:
            key = obj['Key']
            # Look for files named occupations_overview_vX.json
            match = re.search(pattern, key)
            if match:
                versions.append(int(match.group(1)))

        # If we found any versions, set version to the next one
        if versions:
            version = max(versions) + 1

    return str(version)
