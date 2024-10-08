import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class LambdaLayerStack extends cdk.Stack {
    public readonly layer: lambda.LayerVersion;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create a Lambda layer
        this.layer = new lambda.LayerVersion(this, 'MyPythonLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'lambda-layer.zip')),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
            description: 'A layer with modules neccesary for the lambda functions',
        });
    }
}
