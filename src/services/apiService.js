
/**
 * Petrolink API Service Client
 * Integrates the public API into the Intelligence Hub
 */

class PetrolinkAPIClient {
  constructor(apiKey, baseURL = process.env.REACT_APP_API_URL) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }

  /**
   * Analyze a candidate via the public API
   */
  async analyzeCandidate(candidateData) {
    try {
      const response = await fetch(\`\${this.baseURL}/v1/analyze/profile\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          profile: candidateData,
          options: {
            source: 'intelligence_hub',
            enrich_with_market_data: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(\`API Error: \${response.status}\`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Analysis failed:', error);
      // Fallback to local analysis
      return this.fallbackAnalysis(candidateData);
    }
  }

  /**
   * Batch analyze multiple candidates
   */
  async batchAnalyze(candidates, callbackUrl) {
    const response = await fetch(\`\${this.baseURL}/v1/batch/analyze\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify({
        profiles: candidates,
        callback_url: callbackUrl
      })
    });

    return await response.json();
  }

  /**
   * Search across all analyzed profiles
   */
  async searchProfiles(filters) {
    const queryParams = new URLSearchParams(filters).toString();
    const response = await fetch(\`\${this.baseURL}/v1/search?\${queryParams}\`, {
      headers: {
        'X-API-Key': this.apiKey
      }
    });

    return await response.json();
  }

  /**
   * Get API usage statistics
   */
  async getUsageStats() {
    const response = await fetch(\`\${this.baseURL}/v1/stats/usage\`, {
      headers: {
        'X-API-Key': this.apiKey
      }
    });

    return await response.json();
  }

  /**
   * Fallback analysis when API is unavailable
   */
  fallbackAnalysis(candidateData) {
    // Use existing local analysis functions
    const aiAnalysis = analyzeCandidateWithAI(candidateData);
    const skillsIndex = buildSkillsIndex({
      ...candidateData,
      ai_analysis_v2: aiAnalysis
    });

    return {
      requestId: \`local_\${Date.now()}\`,
      status: 'success',
      analysis: {
        ...aiAnalysis,
        skills_enhanced: skillsIndex,
        api_version: 'local_fallback'
      },
      _links: {}
    };
  }
}

// React hook for using the API
export function usePetrolinkAPI() {
  const [client, setClient] = useState(null);

  useEffect(() => {
    const apiKey = localStorage.getItem('petrolink_api_key') || 
                   process.env.REACT_APP_DEFAULT_API_KEY;
    
    setClient(new PetrolinkAPIClient(apiKey));
  }, []);

  return client;
}

// Export singleton instance
export const defaultAPIClient = new PetrolinkAPIClient();
