import { Utils } from "../utils";
import { AppConfig } from "../types";

export class EvaluationsClient {
  private readonly API;
  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0, -1);
  }

  // Fetch evaluation summaries
  async getEvaluationSummaries(continuationToken?: string, pageIndex?: number) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + "/eval-results-handler", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ operation: "get_evaluation_summaries" }),
    });
    console.log("response in the api: ", response);
    if (!response.ok) {
      throw new Error("Failed to get evaluation summaries");
    }

    const result = await response.json();
    return result.body ? JSON.parse(result.body) : [];
    // return JSON.parse(result.body || []); 
  }

  // Fetch detailed evaluation results
  async getEvaluationResults(evaluationId: string) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + "/eval-results-handler", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({
        operation: "get_evaluation_results",
        evaluation_id: evaluationId,
      }),
    });
 
    if (!response.ok) {
      throw new Error("Failed to get evaluation results");
    }

    const result = await response.json();
    return JSON.parse(result.body); // Adjust based on your API response
  }
}
