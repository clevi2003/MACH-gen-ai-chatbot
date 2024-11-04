FROM public.ecr.aws/lambda/python:3.12

# Copy function code
COPY lambda_handler.py ${LAMBDA_TASK_ROOT}

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Set the CMD to your handler (function name)
CMD ["lambda_handler.lambda_handler"]
