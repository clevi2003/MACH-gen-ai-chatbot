# Welcome to MATCH - MA Academics to Careers Helper
## Overview
MATCH is a serverless application designed to assist prospective students interested in higher education within MA in researching courses and programs and their career connections. Built using AWS CDK (Cloud Development Kit), it integrates AWS Cognito for user management and AWS Lambda for custom authorization logic. MATCH provides clear, tailored guidance to prospective students while maintaining a professional and approachable tone.

## Implementation Playbook
[Playbook](https://docs.google.com/document/d/1DJ0JsV67MwtGW9PUmDlKTRCCA_M1QLMT/edit?usp=sharing&ouid=100185107034702960454&rtpof=true&sd=true)  (Contains specific information about MATCH, including a highly detailed deployment guide) 

## Getting Started
### Prerequisites
Before you begin, ensure you have the following installed:

* Node.js (version 14.x or later)
* AWS CDK
* Python (for Lambda functions)
* AWS CLI configured with your AWS credentials

### Development
Clone the repository and check all pre-requisites.

### Useful commands
* `git clone <Github url>` clone the repo
* `npm run build` compile typescript to js
* `npm run watch` watch for changes and compile
* `npm run test` perform the jest unit tests
* `npx cdk deploy` deploy this stack to your default AWS account/region
* `npx cdk diff` compare deployed stack with current state
* `npx cdk synth` emits the synthesized CloudFormation template
* `npm i` Install dependencies
### Deployment Instructions:
* Change the constants in `lib/constants.ts`!
* Deploy with `npm run build && npx cdk deploy [stack name from constants.ts]`
* Configure Cognito using the CDK outputs
### Architecture
![MACH Possible Architecture (3)](https://github.com/user-attachments/assets/2aaf1955-42f1-4b2d-ac4b-ee3bc70578a2)


## Contributing
### Contributions are welcome! Please follow these steps:

* Fork the repository.
* Create a new branch (git checkout -b feature/YourFeature).
* Make your changes and commit them (git commit -m 'Add some feature').
* Push to the branch (git push origin feature/YourFeature).
* Open a pull request.
### Developers
* Claudia Levi
* Leadora Kyin
