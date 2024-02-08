/**
 * Cloudflare Worker script to fetch and cache data from an API.
 * 
 * This script uses Cloudflare's Cache API to cache the response:
 * https://developers.cloudflare.com/workers/runtime-apis/cache
 * 
 * Secrets are used to securely store the Authorization token:
 * https://developers.cloudflare.com/workers/platform/environment-variables
 * 
 * @param {Request} request
 */

const COMPANY_ID = "REDACTED";
const CACHE_TTL = 60 * 60 * 3; // Cache for 3 hours

async function handleRequest(request, env, ctx) {
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: env.BREEZY_API_KEY, // Use the secret
    },
  };

  /**
   * Get positions
   */
  const positionUrl = new URL(`https://api.breezy.hr/v3/company/${COMPANY_ID}/positions`);
  positionUrl.searchParams.append('state', 'published');

  // Try to find the response in the cache
  let response = await caches.default.match(positionUrl);

  if (!response) {
    try {
      // If not in cache, fetch from the server
      response = await fetch(positionUrl, options);

      // Check if the status was successful before caching
      if (!response.ok) {
        throw new Error(await response.text());
      }

      // Get the response body
      const responseBody = await response.text();

      // Create a new response with the same body for caching
      const responseToCache = new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

      // Set the cache to expire after CACHE_TTL seconds
      responseToCache.headers.append('Cache-Control', `public, max-age=${CACHE_TTL}`);

      // Create a new cache entry
      let cache = await caches.open('v1');
      // Put the new response into the cache
      ctx.waitUntil(cache.put(positionUrl, responseToCache));

      // Parse the response body as JSON
      const positions = JSON.parse(responseBody);

      const modifiedPositions = mapPositions(positions);

      return new Response(JSON.stringify(modifiedPositions), {
        headers: HEADERS,
      });
    } catch (err) {
      return new Response(err.stack || err, {status: 500});
    }
  } else {
    const positions = await response.json();

    const modifiedPositions = mapPositions(positions);

    return new Response(JSON.stringify(modifiedPositions), {
      headers: HEADERS,
    });
  }
}

const HEADERS = { 
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://REDACTED.com",
  "Access-Control-Allow-Methods": "GET",
  "Access-Control-Allow-Headers": "Content-Type",
}

/**
 * Used to format the output to be easier to read
 */
function mapPositions(positions) {
  return positions.map(({_id, type, name, friendly_id: url, experience, location, education, department, description, category, creation_date, updated_date, tags}) => ({
    _id,
    type,
    name,
    url,
    experience,
    location,
    education,
    department,
    description,
    category,
    creation_date,
    updated_date,
    tags,
  }));
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};