import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

// Import Lambda L2 construct
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from "aws-cdk-lib/aws-s3";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

interface LambdaFunctionStackProps {  
  readonly wsApiEndpoint : string;  
  readonly sessionTable : Table;  
  readonly feedbackTable : Table;
  readonly feedbackBucket : s3.Bucket;
  readonly knowledgeBucket : s3.Bucket;
  readonly knowledgeBase : bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
  readonly evalSummariesTable : Table;
  readonly evalResutlsTable : Table;
  readonly evalTestCasesBucket : s3.Bucket;
  readonly ragasDependenciesBucket : s3.Bucket;
}

export class LambdaFunctionStack extends cdk.Stack {  
  public readonly chatFunction : lambda.Function;
  public readonly sessionFunction : lambda.Function;
  public readonly feedbackFunction : lambda.Function;
  public readonly deleteS3Function : lambda.Function;
  public readonly getS3Function : lambda.Function;
  public readonly uploadS3Function : lambda.Function;
  public readonly syncKBFunction : lambda.Function;
  public readonly generateResponseFunction : lambda.Function;
  public readonly llmEvalFunction : lambda.Function;
  public readonly handleEvalResultsFunction : lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);    

    const sessionAPIHandlerFunction = new lambda.Function(scope, 'SessionHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "DDB_TABLE_NAME" : props.sessionTable.tableName
      },
      timeout: cdk.Duration.seconds(30)
    });
    
    sessionAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.sessionTable.tableArn, props.sessionTable.tableArn + "/index/*"]
    }));

    this.sessionFunction = sessionAPIHandlerFunction;

        // Define the Lambda function resource
        const websocketAPIFunction = new lambda.Function(scope, 'ChatHandlerFunction', {
          runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
          code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-chat')), // Points to the lambda directory
          handler: 'index.handler', // Points to the 'hello' file in the lambda directory
          environment : {
            "WEBSOCKET_API_ENDPOINT" : props.wsApiEndpoint.replace("wss","https"),            
            "PROMPT" : `You are a helpful AI chatbot that will answer questions based on your knowledge. 
            You have access to a search tool that you will use to look up answers to questions.`,
            'KB_ID' : props.knowledgeBase.attrKnowledgeBaseId
          },
          timeout: cdk.Duration.seconds(300)
        });
        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:InvokeModel',
            
          ],
          resources: ["*"]
        }));
        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:Retrieve'
          ],
          resources: [props.knowledgeBase.attrKnowledgeBaseArn]
        }));

        websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:InvokeFunction'
          ],
          resources: [this.sessionFunction.functionArn]
        }));
        
        this.chatFunction = websocketAPIFunction;

    const feedbackAPIHandlerFunction = new lambda.Function(scope, 'FeedbackHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'feedback-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "FEEDBACK_TABLE" : props.feedbackTable.tableName,
        "FEEDBACK_S3_DOWNLOAD" : props.feedbackBucket.bucketName
      },
      timeout: cdk.Duration.seconds(30)
    });
    
    feedbackAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.feedbackTable.tableArn, props.feedbackTable.tableArn + "/index/*"]
    }));

    feedbackAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.feedbackBucket.bucketArn,props.feedbackBucket.bucketArn+"/*"]
    }));

    this.feedbackFunction = feedbackAPIHandlerFunction;
    
    const deleteS3APIHandlerFunction = new lambda.Function(scope, 'DeleteS3FilesHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/delete-s3')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    deleteS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.deleteS3Function = deleteS3APIHandlerFunction;

    const getS3APIHandlerFunction = new lambda.Function(scope, 'GetS3FilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/get-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    getS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.getS3Function = getS3APIHandlerFunction;


    const kbSyncAPIHandlerFunction = new lambda.Function(scope, 'SyncKBHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/kb-sync')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "KB_ID" : props.knowledgeBase.attrKnowledgeBaseId,      
        "SOURCE" : props.knowledgeBaseSource.attrDataSourceId  
      },
      timeout: cdk.Duration.seconds(30)
    });

    kbSyncAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:*'
      ],
      resources: [props.knowledgeBase.attrKnowledgeBaseArn]
    }));
    this.syncKBFunction = kbSyncAPIHandlerFunction;

    const uploadS3APIHandlerFunction = new lambda.Function(scope, 'UploadS3FilesHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'knowledge-management/upload-s3')), // Points to the lambda directory
      handler: 'index.handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "BUCKET" : props.knowledgeBucket.bucketName,        
      },
      timeout: cdk.Duration.seconds(30)
    });

    uploadS3APIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.knowledgeBucket.bucketArn,props.knowledgeBucket.bucketArn+"/*"]
    }));
    this.uploadS3Function = uploadS3APIHandlerFunction;

    const generateResponseFunction = new lambda.Function(scope, 'GenerateResponseFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
          code: lambda.Code.fromAsset(path.join(__dirname, 'generate-response')), // Points to the lambda directory
          handler: 'index.handler', // Points to the 'hello' file in the lambda directory
          environment : {
            "PROMPT" : `You are a helpful AI chatbot that will answer questions based on your knowledge. 
            You have access to a search tool that you will use to look up answers to questions.`,
            'KB_ID' : props.knowledgeBase.attrKnowledgeBaseId
          },
          timeout: cdk.Duration.seconds(300)
        });
    generateResponseFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:InvokeModel',
        
      ],
      resources: ["*"]
    }));
    generateResponseFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:Retrieve'
      ],
      resources: [props.knowledgeBase.attrKnowledgeBaseArn]
    }));
    this.generateResponseFunction = generateResponseFunction;

    const evalResultsAPIHandlerFunction = new lambda.Function(scope, 'EvalResultsHandlerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'eval-results-handler')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "EVALUATION_RESULTS_TABLE" : props.evalResutlsTable.tableName,
        "EVALUATION_SUMMARIES_TABLE" : props.evalSummariesTable.tableName
      }
    });
    evalResultsAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({ 
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.evalResutlsTable.tableArn, props.evalResutlsTable.tableArn + "/index/*", props.evalSummariesTable.tableArn, props.evalSummariesTable.tableArn + "/index/*"]
    }));
    this.handleEvalResultsFunction = evalResultsAPIHandlerFunction;
    props.evalResutlsTable.grantReadWriteData(evalResultsAPIHandlerFunction);
    props.evalSummariesTable.grantReadWriteData(evalResultsAPIHandlerFunction);

    const llmEvalFunction = new lambda.DockerImageFunction(scope, 'llmEvaluationFunction', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, 'llm-evaluation'), {
        platform: Platform.LINUX_AMD64, // Specify the correct platform
      }),
      environment: {
        "RESULTS_TABLE" : props.evalResutlsTable.tableName, 
        "TEST_CASES_BUCKET" : props.evalTestCasesBucket.bucketName, 
        "GENERATE_RESPONSE_LAMBDA_NAME" : generateResponseFunction.functionName,
        "BEDROCK_MODEL_ID" : "anthropic.claude-3-haiku-20240307-v1:0",
        "EVAL_RESULTS_HANDLER_LAMBDA_NAME": evalResultsAPIHandlerFunction.functionName, // Include this if needed
      },
      timeout: cdk.Duration.seconds(600),
      memorySize: 4096
    });
    llmEvalFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.evalTestCasesBucket.bucketArn,props.evalTestCasesBucket.bucketArn+"/*"]
    }));
    llmEvalFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction'
      ],
      resources: [this.sessionFunction.functionArn]
    }));
    llmEvalFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:GetAuthorization',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:BatchCheckLayerAvailability'
      ],
      resources: ['*']
    }));
    llmEvalFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:InvokeModel'
      ],
      resources: ['*']
    }));

    props.evalResutlsTable.grantReadWriteData(llmEvalFunction);
    props.evalTestCasesBucket.grantReadWrite(llmEvalFunction);
    generateResponseFunction.grantInvoke(llmEvalFunction);
    evalResultsAPIHandlerFunction.grantInvoke(llmEvalFunction);
    this.llmEvalFunction = llmEvalFunction;
  }
}
