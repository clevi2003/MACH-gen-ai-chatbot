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
}
