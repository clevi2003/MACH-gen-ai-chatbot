import json
import boto3
import os
from botocore.exceptions import ClientError
import pandas as pd
import io
from helpers import get_next_version
import logging

s3 = boto3.client('s3')
source_bucket = os.environ['SOURCE_BUCKET']
# destination_prefix = os.environ['DESTINATION_PREFIX']

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
        'body': json.dumps('bls data transformation completed.')
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
    
    # get next version number (version should be the year)
    #pattern should match the folder name bls_data_vX
    destination_prefix = "processed/bls_data_v"
    version = get_next_version(s3, source_bucket, destination_prefix, r"processed/bls_data_v(\d+)")
    destination_prefix += version + "/"
    # source_prefix = "raw/bls_data_v" + version + "/"
    year = version
            
    # Read and process each file
    data_frames = {}
    for file_name in expected_files:
        object_key = folder_prefix + file_name
        csv_obj = s3.get_object(Bucket=source_bucket, Key=object_key)
        body = csv_obj['Body'].read().decode('utf-8')
        df = pd.read_csv(io.StringIO(body), header=1)
        data_frames[file_name] = df
    
    transformed_data = transform_data(data_frames, year)
    
    current_dir = "current/bls_data/"
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
    edu_df = data["education.csv"]
    transformed_edu_data = {}
    # iterate over rows 1 - 832 inclusive
    for i in range(1, 833):
        row = edu_df.iloc[i]
        occupation = row[f"{year} National Employment Matrix title"].replace("[1]", "")
        less_than_hs = row["Less than high school diploma"]
        hs_diploma = row["High school diploma or equivalent"]
        some_college = row["Some college, no degree"]
        associate = row["Associate's degree"]
        bachelor = row["Bachelor's degree"]
        master = row["Master's degree"]
        doctorate = row["Doctoral or professional degree"]

        content = (
            f"People with a less than high school diploma constitute {less_than_hs}% of the workforce in the "
            f"occupation of {occupation}. People with a high school diploma or equivalent constitute {hs_diploma}% of "
            f"the workforce in the occupation of {occupation}. People with some college, no degree constitute "
            f"{some_college}% of the workforce in the occupation of {occupation}. People with an associate's degree "
            f"constitute {associate}% of the workforce in the occupation of {occupation}. People with a bachelor's "
            f"degree constitute {bachelor}% of the workforce in the occupation of {occupation}. People with a "
            f"master's degree constitute {master}% of the workforce in the occupation of {occupation}. People with a "
            f"doctoral or professional degree constitute {doctorate}% of the workforce in the occupation of "
            f"{occupation}. "
        )

        transformed_edu_data[occupation] = {
            "content": content,
            "less_than_hs": less_than_hs,
            "hs_diploma": hs_diploma,
            "some_college": some_college,
            "associate": associate,
            "bachelor": bachelor,
            "master": master,
            "doctorate": doctorate
        }
    transformed_data["education.json"] = transformed_edu_data

    # Transforming the occupation data
    occ_df = data["occupation.csv"]
    transformed_occ_data = {}
    # iterate over all but the last row
    for index, row in occ_df.iloc[:-1].iterrows():
        occupation = row[f"{year} National Employment Matrix occupation title"]
        industry = row[f"{year} National Employment Matrix industry title"]
        factors = row["Factors affecting occupational utilization"].split(" - ")
        change = factors[0]
        explanation = factors[1]

        content = (
            f"the occupation of {occupation} within the industry of {industry} is expected to experience a {change}"
            f" as {explanation}."
        )

        transformed_occ_data[(occupation, industry)] = {
            "content": content,
            "change in employment prospects": change,
            "explanation for change in employment prospects": explanation
        }
    transformed_data["occupation.json"] = transformed_occ_data

    # Transforming the skills data
    skills_df = data["skills.csv"]
    transformed_skills_data = {}
    # iterate over rows 1 - 7th from the end inclusive
    for i in range(1, len(skills_df) - 6):
        row = skills_df.iloc[i]
        occupation = row[f"{year} National Employment Matrix title"]
        if "[2]" in occupation:
            continue
        emp_current = row[f"Employment, {year}"]
        emp_later = row[f"Employment, {ten_year}"]
        emp_change = row[f"Employment change, numeric, {year}–{ten_decade}"]
        emp_pct_change = row[f"Employment change, percent, {year}–{ten_decade}"]
        median_salary = row[f"Median annual wage, dollars, {year}[1]"]
        edu_needed = row["Typical education needed for entry"]
        adaptability = row["Adaptability"]
        cs = row["Computers and information technology"]
        creativity = row["Creativity and innovation"]
        critical_thinking = row["Critical and analytical thinking"]
        customer_service = row["Customer service"]
        detail_oriented = row["Detail oriented"]
        interpersonal = row["Interpersonal"]
        leadership = row["Leadership"]
        math = row["Mathematics"]
        mechanical = row["Mechanical"]
        fine_motor = row["Fine motor"]
        physical = row["Physical strength and stamina"]
        problem_solving = row["Problem solving and decision making"]
        reading = row["Writing and reading"]
        management = row["Project management"]
        speaking = row["Speaking and listening"]
        science = row["Science"]
        content = (
            f"In {year}, there are {emp_current} people employed in the occupation of {occupation}. By {ten_year}, "
            f"there are expected to be {emp_later} people employed in the occupation of {occupation}. This "
            f"represents a change of {emp_change} people, or a {emp_pct_change}% change in employment. The median "
            f"annual wage for the occupation of {occupation} is ${median_salary} in {year}. The typical education "
            f"needed for entry into the occupation of {occupation} is {edu_needed}. With skills scores ranging "
            f"from 1 (not important) to 5 (extremely important), the skills needed for the occupation"
            f" of {occupation} are adaptability with a score of {adaptability}, computers and information "
            f"technology with a score of {cs}, creativity and innovation with a score of {creativity}, "
            f"critical and analytical thinking with a score of {critical_thinking}, customer service with a score "
            f"of {customer_service}, detail oriented with a score of {detail_oriented}, interpersonal with a "
            f"score of {interpersonal}, leadership with a score of {leadership}, mathematics with a score of "
            f"{math}, mechanical with a score of {mechanical}, fine motor with a score of {fine_motor}, "
            f"physical strength and stamina with a score of {physical}, problem solving and decision making with "
            f"a score of {problem_solving}, writing and reading with a score of {reading}, project management "
            f"with a score of {management}, speaking and listening with a score of {speaking}, and science with a "
            f"score of {science}. "
        )

        transformed_skills_data[occupation] = {
            "content": content,
            f"employment_{year}": emp_current,
            f"employment_{ten_year}": emp_later,
            "employment_change": emp_change,
            "employment_pct_change": emp_pct_change,
            "median_salary": median_salary,
            "entry_level_education_needed": edu_needed,
            "adaptability_skill": adaptability,
            "computer_science_skill": cs,
            "creativity_skill": creativity,
            "critical_thinking_skill": critical_thinking,
            "customer_service_skill": customer_service,
            "detail_oriented_skill": detail_oriented,
            "interpersonal_skill": interpersonal,
            "leadership_skill": leadership,
            "math_skill": math,
            "mechanical_skill": mechanical,
            "fine_motor_skill": fine_motor,
            "physical_strength_skill": physical,
            "problem_solving_skill": problem_solving,
            "reading_writing_skill": reading,
            "project_management_skill": management,
            "speaking_listening_skill": speaking,
            "science_skill": science
        }
    transformed_data["skills.json"] = transformed_skills_data
    return transformed_data

def write_transformed_data_to_s3(data, key):
    s3.put_object(Bucket=source_bucket, Key=key, Body=data)
