import boto3
import os
from pdf2image import convert_from_bytes
import magic

BUCKET = os.environ['BUCKET']

def lambda_handler(event, context):
    try:
        # Initialize clients
        s3 = boto3.client('s3')
        textract = boto3.client('textract')
        
        # File paths
        key = 'raw/GCC_GreenfieldCommunityCollege_Programs.pdf'
        target_key = 'current/GCC/GCC_GreenfieldCommunityCollege_Programs.txt'
        
        # Get the file from S3
        response = s3.get_object(Bucket=BUCKET, Key=key)
        file = response['Body'].read()

        # Check file type
        mime = magic.Magic(mime=True)
        file_type = mime.from_buffer(file)
        print(f"File type detected: {file_type}")
        
        if "pdf" not in file_type:
            raise ValueError("Unsupported file format. Please upload a PDF.")
        
        # Extract text
        try:
            textract_response = textract.detect_document_text(Document={'Bytes': file})
        except Exception as e:
            # If unsupported, convert PDF to images and use OCR
            print("Converting PDF to images...")
            images = convert_from_bytes(file, dpi=300)
            text = ''
            for image in images:
                response = textract.detect_document_text(Document={'Bytes': image.tobytes()})
                for block in response['Blocks']:
                    if block['BlockType'] == 'LINE':
                        text += block['Text'] + '\n'
        else:
            text = ''
            for item in textract_response['Blocks']:
                if item['BlockType'] == 'LINE':
                    text += item['Text'] + '\n'
        
        # Save extracted text to S3
        s3.put_object(Bucket=BUCKET, Key=target_key, Body=text)
        print(f"Text stored at s3://{target_key}")
        
        return {
            'statusCode': 200,
            'body': 'Text extracted and stored successfully.'
        }
    except Exception as e:
        print(f"Error: {e}")
        raise e
