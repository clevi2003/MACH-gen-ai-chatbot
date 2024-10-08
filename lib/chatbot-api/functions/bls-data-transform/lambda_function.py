import json
import boto3
import os
import csv
from botocore.exceptions import ClientError
import io
# from helpers import get_next_version
import logging
import re

s3 = boto3.client('s3')
source_bucket = os.environ['BUCKET']

# setup logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    for record in event['Records']:
        s3_event = record['s3']
        bucket_name = s3_event['bucket']['name']
        object_key = s3_event['object']['key']

        logger.info(f"Processing file {object_key} from bucket {bucket_name}")

        # Since the event only triggers on the marker file, proceed directly
        folder_prefix = os.path.dirname(object_key) + '/'
        process_bls_data(folder_prefix)

    return {
        'statusCode': 200,
        'body': json.dumps('BLS data transformation completed.')
    }

def process_bls_data(folder_prefix):
    logger.info(f"Processing BLS data for folder {folder_prefix}")

    # List of expected files
    expected_files = ['skills.csv', 'occupation.csv', 'education.csv']
    
    # Check if all expected files are present
    for file_name in expected_files:
        object_key = folder_prefix + file_name
        if not check_s3_object_exists(source_bucket, object_key):
            logger.error(f"File {object_key} does not exist.")
            print(f"File {object_key} does not exist.")
            return  # Exit if any file is missing
    
    # get next version number
    destination_prefix = "processed/bureau_labor_statistics_data_v"
    version = get_next_version(s3, source_bucket, destination_prefix, r"processed/bureau_labor_statistics_data_v(\d+)", v1="2023")
    destination_prefix += version + "/"
    year = version
            
    # Read and process each file
    data = {}
    for file_name in expected_files:
        object_key = folder_prefix + file_name
        csv_obj = s3.get_object(Bucket=source_bucket, Key=object_key)
        body = csv_obj['Body'].read().decode('utf-8')
        data[file_name] = list(csv.reader(io.StringIO(body).readlines()))

    transformed_data = transform_data(data, year)
    
    current_dir = "current/bureau_labor_statistics_data/"
    # Write transformed data to S3 raw and processed folders
    for key, val in transformed_data.items():
        write_transformed_data_to_s3(json.dumps(val), destination_prefix + key)
        print(f"Transformed data written to s3://{source_bucket}/{destination_prefix + key}")
        write_transformed_data_to_s3(json.dumps(val), current_dir + key)
        print(f"Transformed data written to s3://{source_bucket}/{current_dir + key}")

def check_s3_object_exists(bucket, key):
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False

def transform_data(data, year):
    ten_year = str(int(year) + 10)
    decade = str(year)[2:]
    ten_decade = str(ten_year)[2:]
    transformed_data = {}

    # Transforming the education data
    edu_data = data["education.csv"]
    edu_header = edu_data[1]
    edu_indices = {
        "occupation": edu_header.index(f"{year} National Employment Matrix title"),
        "less_than_hs": edu_header.index("Less than high school diploma"),
        "hs_diploma": edu_header.index("High school diploma or equivalent"),
        "some_college": edu_header.index("Some college, no degree"),
        "associate": edu_header.index("Associate's degree"),
        "bachelor": edu_header.index("Bachelor's degree"),
        "master": edu_header.index("Master's degree"),
        "doctorate": edu_header.index("Doctoral or professional degree")
    }
    transformed_edu_data = ""
    for row in edu_data[2:]:
        try:
            float(row[edu_indices["some_college"]])
        except ValueError:
            break
        occupation = row[edu_indices["occupation"]].replace("[1]", "")
        content = (
            f"People with a less than high school diploma constitute {row[edu_indices['less_than_hs']]}% of the "
            f"workforce in the occupation of {occupation}. People with a high school diploma or equivalent constitute "
            f"{row[edu_indices['hs_diploma']]}% of the workforce in the occupation of {occupation}. People with some "
            f"college, no degree constitute {row[edu_indices['some_college']]}% of the workforce. People with an "
            f"associate's degree constitute {row[edu_indices['associate']]}%, bachelor's degree {row[edu_indices['bachelor']]}, "
            f"master's degree {row[edu_indices['master']]}, and doctoral or professional degree {row[edu_indices['doctorate']]}."
        )
        transformed_edu_data += content + "\n"
    transformed_data["education.txt"] = transformed_edu_data

    # Transforming the occupation data
    occ_data = data["occupation.csv"]
    occ_header = occ_data[1]
    occ_indices = {
        "occupation": occ_header.index(f"{year} National Employment Matrix occupation title"),
        "industry": occ_header.index(f"{year} National Employment Matrix industry title"),
        "factors": occ_header.index("Factors affecting occupational utilization")
    }

    transformed_occ_data = ""
    for row in occ_data[2:-1]:
        occupation = row[occ_indices["occupation"]]
        industry = row[occ_indices["industry"]]
        factors = extract_parts(row[occ_indices["factors"]], "-")
        change, explanation = factors[0], " ".join(factors[1:])

        content = (
            f"The occupation of {occupation} within the industry of {industry} is expected to experience a {change} "
            f"as {explanation}."
        )

        transformed_occ_data += content + "\n"
    transformed_data["occupation.txt"] = transformed_occ_data

    # Transforming the skills data
    skills_data = data["skills.csv"]
    skills_header = skills_data[1]
    skills_indices = {
        "occupation": skills_header.index(f"{year} National Employment Matrix title"),
        "emp_current": skills_header.index(f"Employment, {year}"),
        "emp_later": skills_header.index(f"Employment, {ten_year}"),
        "emp_change": skills_header.index(f"Employment change, numeric, {year}–{ten_decade}"),
        "emp_pct_change": skills_header.index(f"Employment change, percent, {year}–{ten_decade}"),
        "median_salary": skills_header.index(f"Median annual wage, dollars, {year}[1]"),
        "edu_needed": skills_header.index("Typical education needed for entry"),
        "adaptability": skills_header.index("Adaptability"),
        "cs": skills_header.index("Computers and information technology"),
        "creativity": skills_header.index("Creativity and innovation"),
        "critical_thinking": skills_header.index("Critical and analytical thinking"),
        "customer_service": skills_header.index("Customer service"),
        "detail_oriented": skills_header.index("Detail oriented"),
        "interpersonal": skills_header.index("Interpersonal"),
        "leadership": skills_header.index("Leadership"),
        "math": skills_header.index("Mathematics"),
        "mechanical": skills_header.index("Mechanical"),
        "fine_motor": skills_header.index("Fine motor"),
        "physical": skills_header.index("Physical strength and stamina"),
        "problem_solving": skills_header.index("Problem solving and decision making"),
        "reading": skills_header.index("Writing and reading"),
        "management": skills_header.index("Project management"),
        "speaking": skills_header.index("Speaking and listening"),
        "science": skills_header.index("Science")
    }

    transformed_skills_data = ""
    for row in skills_data[2:]:
        occupation = row[skills_indices["occupation"]]
        if "[2]" in occupation:
            continue
        occupation = occupation.replace("[2]", "")

        content = (
            f"In {year}, there are {row[skills_indices['emp_current']]} thousand people employed in the occupation of {occupation}. "
            f"By {ten_year}, there are expected to be {row[skills_indices['emp_later']]} thousand people employed in the occupation of "
            f"{occupation}. This represents a change of {row[skills_indices['emp_change']]} thousand people, or a {row[skills_indices['emp_pct_change']]}% change "
            f"in employment. The median annual wage for the occupation is ${row[skills_indices['median_salary']]} in {year}. The typical "
            f"education needed for entry is {row[skills_indices['edu_needed']]}. The skill requirements, scored from 0 to 5, are adaptability ({row[skills_indices['adaptability']]}), "
            f"computers and information technology ({row[skills_indices['cs']]}), "
            f"creativity and innovation ({row[skills_indices['creativity']]}), critical and analytical thinking "
            f"({row[skills_indices['critical_thinking']]}), customer service ({row[skills_indices['customer_service']]}), "
            f"detail oriented ({row[skills_indices['detail_oriented']]}), interpersonal ({row[skills_indices['interpersonal']]}), "
            f"leadership ({row[skills_indices['leadership']]}), mathematics ({row[skills_indices['math']]}), "
            f"mechanical ({row[skills_indices['mechanical']]}), fine motor skills ({row[skills_indices['fine_motor']]}), "
            f"physical strength and stamina ({row[skills_indices['physical']]}), problem solving and decision making "
            f"({row[skills_indices['problem_solving']]}), writing and reading ({row[skills_indices['reading']]}), project management "
            f"({row[skills_indices['management']]}), speaking and listening ({row[skills_indices['speaking']]}), and science "
            f"({row[skills_indices['science']]})."
        )

        transformed_skills_data += content + "\n"
    transformed_data["skills.txt"] = transformed_skills_data
    return transformed_data

def write_transformed_data_to_s3(data, key):
    s3.put_object(Bucket=source_bucket, Key=key, Body=data)

def get_next_version(s3, bucket_name, prefix, pattern, v1=None):
    """
    Fetches the list of objects in the prefix folder and determines the next version number for 
    the file pattern.
    """
    # List objects in the 'onet_data/' folder
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)

    if v1:
        version = v1
    else:
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
    #return "2023"
    return str(version)

def extract_parts(input_str, delimiter):
    if not isinstance(input_str, str):
        return []
    pattern = r'\s*' + re.escape(delimiter) + r'\s*'
    parts = re.split(pattern, input_str)
    parts = [part.strip() for part in parts if part.strip()]
    return parts