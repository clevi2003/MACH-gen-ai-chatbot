import { Utils } from "../utils";
import { AppConfig } from "../types";

export class EvaluationsClient {
  private readonly API;
  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0, -1);
  }

  // Fetch evaluation summaries
  async getEvaluationSummaries(continuationToken?: any, limit: number = 10) {
    const auth = await Utils.authenticate();
    const body: any = {
      operation: "get_evaluation_summaries",
      limit,
    };
    if (continuationToken) {
      body.continuation_token = continuationToken;
    }

    const response = await fetch(`${this.API}/eval-results-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error("Failed to get evaluation summaries");
    }

    const result = await response.json();
    return result;
  }

  // Fetch detailed evaluation results
  async getEvaluationResults(evaluationId: string, continuationToken?: any, limit: number = 10) {
    const auth = await Utils.authenticate();
    const body: any = {
      operation: "get_evaluation_results",
      evaluation_id: evaluationId,
      limit,
    };
    if (continuationToken) {
      body.continuation_token = continuationToken;
    }

    const response = await fetch(`${this.API}/eval-results-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error("Failed to get evaluation results");
    }

    const result = await response.json();
    return result;
  }
  async startNewEvaluation(evaluationName: string, testCaseFile: String) {
    const auth = await Utils.authenticate();
    const body: any = {
      // operation: "start_new_evaluation",
      evaluation_name: evaluationName,
      testCasesKey: testCaseFile,
    };
    console.log("body in the api", body);

    const response = await fetch(`${this.API}/eval-run-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body), 
    });
    if (!response.ok) {
      throw new Error("Failed to start new evaluation");
    }

    const result = await response.json();
    return result;
  }

   // Returns a URL from the this.API that allows one file upload to S3 with that exact filename
   async getUploadURL(fileName: string, fileType : string): Promise<string> {    
    if (!fileType) {
      alert('Must have valid file type!');
      return;
    }

    try {
      const auth = await Utils.authenticate();
      const response = await fetch(this.API + '/signed-url-test-cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization' : auth
        },
        body: JSON.stringify({ fileName, fileType })
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const data = await response.json();
      return data.signedUrl;
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }

  // Returns a list of documents in the S3 bucket (hard-coded on the backend)
  async getDocuments(continuationToken?: string, pageIndex?: number) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/s3-test-cases-bucket-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
      body: JSON.stringify({
        continuationToken: continuationToken,
        pageIndex: pageIndex,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to get files');
    }
    const result = await response.json();
    return result;
  }
}
