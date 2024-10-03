import re
import json

def get_next_version(s3, bucket_name, prefix, pattern):
    """
    Fetches the list of objects in the 'onet_data/' folder and determines the next version number.
    """
    # List objects in the 'onet_data/' folder
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

def save_to_s3(s3, bucket_name, s3_key, data):
    """
    Save the given data to S3.
    """
    s3.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=json.dumps(data),
        ContentType='application/json'
    )