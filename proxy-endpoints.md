# API Proxy Endpoints Documentation

This document provides an exhaustive list of all external API endpoints used in the Nacho Time application that need to be proxied. The application makes calls to three external services: **TMDB (The Movie Database)**, **Trakt.tv**, and **Prowlarr** (user-configured).

---

## Table of Contents

1. [TMDB API Endpoints](#tmdb-api-endpoints)
2. [Trakt.tv API Endpoints](#trakttv-api-endpoints)
3. [Prowlarr API Endpoints](#prowlarr-api-endpoints)
4. [Static Asset Endpoints](#static-asset-endpoints)
5. [Authentication Requirements](#authentication-requirements)

---

## TMDB API Endpoints

**Base URL:** `https://api.themoviedb.org/3`

**Authentication:** Bearer token (Read Access Token) sent in `Authorization` header

### 1. Configuration

#### GET `/configuration`

**Description:** Get TMDB API configuration including image base URLs and available sizes

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Query Parameters:** None

**Response:** JSON object containing image configuration

**Used in:** `tmdb.rs::get_tmdb_config()`

---

### 2. Movie Endpoints

#### GET `/movie/{tmdb_id}`

**Description:** Get detailed movie information by TMDB ID

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB movie ID

**Query Parameters:** None

**Response:** JSON object containing movie details

**Used in:** `tmdb.rs::get_tmdb_movie()`

---

#### GET `/movie/{tmdb_id}/images`

**Description:** Get all available images (posters, backdrops, logos) for a movie

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB movie ID

**Query Parameters:** None

**Response:** JSON object containing arrays of images

**Used in:** `tmdb.rs::get_tmdb_movie_images()`

---

#### GET `/movie/{tmdb_id}/videos`

**Description:** Get videos/trailers for a movie

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB movie ID

**Query Parameters:** None

**Response:** JSON object containing array of video metadata

**Used in:** `tmdb.rs::get_tmdb_movie_videos()`

---

### 3. TV Show Endpoints

#### GET `/tv/{tmdb_id}`

**Description:** Get detailed TV show information by TMDB ID

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB TV show ID

**Query Parameters:** None

**Response:** JSON object containing TV show details

**Used in:** `tmdb.rs::get_tmdb_show()`

---

#### GET `/tv/{tmdb_id}/images`

**Description:** Get all available images for a TV show

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB TV show ID

**Query Parameters:** None

**Response:** JSON object containing arrays of images

**Used in:** `tmdb.rs::get_tmdb_show_images()`

---

#### GET `/tv/{tmdb_id}/season/{season_number}`

**Description:** Get detailed season information including episodes

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB TV show ID
- `season_number` (integer) - The season number

**Query Parameters:** None

**Response:** JSON object containing season and episode details

**Used in:** `tmdb.rs::get_tmdb_season()`

---

#### GET `/tv/{tmdb_id}/season/{season_number}/images`

**Description:** Get all available images for a specific season

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB TV show ID
- `season_number` (integer) - The season number

**Query Parameters:** None

**Response:** JSON object containing season poster images

**Used in:** `tmdb.rs::get_tmdb_season_images()`

---

#### GET `/tv/{tmdb_id}/season/{season_number}/episode/{episode_number}`

**Description:** Get detailed episode information

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB TV show ID
- `season_number` (integer) - The season number
- `episode_number` (integer) - The episode number

**Query Parameters:** None

**Response:** JSON object containing episode details

**Used in:** `tmdb.rs::get_tmdb_episode()`

---

#### GET `/tv/{tmdb_id}/season/{season_number}/episode/{episode_number}/external_ids`

**Description:** Get external IDs (IMDB, TVDB) for a specific episode

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `tmdb_id` (integer) - The TMDB TV show ID
- `season_number` (integer) - The season number
- `episode_number` (integer) - The episode number

**Query Parameters:** None

**Response:** JSON object containing external IDs

**Used in:** `tmdb.rs::get_tmdb_episode_external_ids()`

---

### 4. Find Endpoints

#### GET `/find/{external_id}`

**Description:** Find movie or TV show by external ID (IMDB)

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Path Parameters:**

- `external_id` (string) - The external ID (e.g., IMDB ID like "tt1234567")

**Query Parameters:**

- `external_source` (string) - Must be "imdb_id"

**Response:** JSON object containing movie_results and tv_results arrays

**Used in:**

- `tmdb.rs::find_tmdb_movie_by_imdb()`
- `tmdb.rs::find_tmdb_show_by_imdb()`

---

### 5. Search Endpoints

#### GET `/search/movie`

**Description:** Search for movies by query string

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Query Parameters:**

- `query` (string, required) - The search query
- `page` (integer, optional) - Page number for pagination (default: 1)

**Response:** JSON object containing paginated search results

**Used in:** `tmdb.rs::search_tmdb_movies()`

---

#### GET `/search/tv`

**Description:** Search for TV shows by query string

**Method:** `GET`

**Headers:**

- `Authorization: Bearer {TMDB_READ_ACCESS_TOKEN}`
- `Accept: application/json`

**Query Parameters:**

- `query` (string, required) - The search query
- `page` (integer, optional) - Page number for pagination (default: 1)

**Response:** JSON object containing paginated search results

**Used in:** `tmdb.rs::search_tmdb_shows()`

---

## Trakt.tv API Endpoints

**Base URL:** `https://api.trakt.tv`

**Authentication:**

- Most endpoints require OAuth2 Bearer token in `Authorization` header
- All endpoints require `trakt-api-key` header with client ID
- All endpoints require `trakt-api-version: 2` header

**Common Headers for All Endpoints:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`

---

### 1. OAuth Authentication Endpoints

#### POST `/oauth/device/code`

**Description:** Generate device codes for device authentication flow

**Method:** `POST`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`

**Body:**

```json
{
  "client_id": "{CLIENT_ID}"
}
```

**Response:** Device code response with user_code and verification_url

**Used in:** `trakt.rs::generate_device_codes()`

---

#### POST `/oauth/device/token`

**Description:** Poll for access token during device authentication flow

**Method:** `POST`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`

**Body:**

```json
{
  "code": "{DEVICE_CODE}",
  "client_id": "{CLIENT_ID}",
  "client_secret": "{CLIENT_SECRET}"
}
```

**Response:** Token response on success (200), or various error codes (400, 404, 409, 410, 418, 429)

**Used in:** `trakt.rs::poll_for_token()`

---

#### POST `/oauth/token`

**Description:** Refresh an expired access token

**Method:** `POST`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`

**Body:**

```json
{
  "refresh_token": "{REFRESH_TOKEN}",
  "client_id": "{CLIENT_ID}",
  "client_secret": "{CLIENT_SECRET}",
  "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
  "grant_type": "refresh_token"
}
```

**Response:** New token response

**Used in:** `trakt.rs::refresh_access_token_internal()`

---

#### POST `/oauth/revoke`

**Description:** Revoke an access token (logout)

**Method:** `POST`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`

**Body:**

```json
{
  "token": "{ACCESS_TOKEN}",
  "client_id": "{CLIENT_ID}",
  "client_secret": "{CLIENT_SECRET}"
}
```

**Response:** Success status (200/204)

**Used in:** `trakt.rs::logout()`

---

### 2. User Endpoints

#### GET `/users/settings`

**Description:** Get current user's profile and settings

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}`

**Query Parameters:** None

**Response:** JSON object containing user profile information

**Used in:** `trakt.rs::get_user_info()`

---

### 3. Movies Endpoints

#### GET `/movies/trending`

**Description:** Get trending movies

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (optional, for authenticated requests)

**Query Parameters:**

- `page` (integer, optional) - Page number for pagination
- `limit` (integer, optional) - Number of results per page

**Response:** JSON array of trending movie items

**Used in:** `trakt.rs::get_trending_movies()`

---

### 4. TV Shows Endpoints

#### GET `/shows/trending`

**Description:** Get trending TV shows

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (optional, for authenticated requests)

**Query Parameters:**

- `page` (integer, optional) - Page number for pagination
- `limit` (integer, optional) - Number of results per page
- `extended` (string) - "full" to get extended information

**Response:** JSON array of trending show items

**Used in:** `trakt.rs::get_trending_shows()`

---

### 5. Sync Endpoints (Authenticated)

#### GET `/sync/watched/movies`

**Description:** Get all watched movies for the authenticated user

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (required)

**Query Parameters:** None

**Response:** JSON array of watched movie items with watch history

**Used in:** `trakt.rs::get_watched_movies()`

---

#### GET `/sync/watched/shows`

**Description:** Get all watched TV shows for the authenticated user

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (required)

**Query Parameters:**

- `extended` (string) - "full" to get extended information

**Response:** JSON array of watched show items with watch history

**Used in:** `trakt.rs::get_watched_shows()`

---

#### GET `/sync/history`

**Description:** Get full watch history (movies and episodes) for the authenticated user

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (required)

**Query Parameters:**

- `limit` (integer, optional) - Number of history items to return

**Response:** JSON array of history items (movies and episodes)

**Used in:** `trakt.rs::get_user_watch_history()`

---

#### GET `/sync/history/shows`

**Description:** Get watch history for all shows

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (required)

**Query Parameters:** None

**Response:** JSON array of show watch history items

**Used in:** `trakt.rs::get_show_watch_history()` (when not using Trakt ID)

---

#### GET `/sync/history/shows/{show_id}`

**Description:** Get watch history for a specific show by Trakt ID

**Method:** `GET`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (required)

**Path Parameters:**

- `show_id` (integer) - The Trakt show ID

**Query Parameters:** None

**Response:** JSON array of watch history items for the show

**Used in:** `trakt.rs::get_show_watch_history()` (when using Trakt ID)

---

#### POST `/sync/history`

**Description:** Add items to watch history (mark as watched)

**Method:** `POST`

**Headers:**

- `Content-Type: application/json`
- `trakt-api-version: 2`
- `trakt-api-key: {CLIENT_ID}`
- `User-Agent: NachoTime/1.0.0`
- `Authorization: Bearer {ACCESS_TOKEN}` (required)

**Body for Movies:**

```json
{
  "movies": [
    {
      "watched_at": "2024-01-01T12:00:00.000Z",
      "title": "Movie Title",
      "year": 2024,
      "ids": {
        "trakt": 12345,
        "slug": "movie-slug",
        "imdb": "tt1234567",
        "tmdb": 67890
      }
    }
  ]
}
```

**Body for Episodes:**

```json
{
  "episodes": [
    {
      "watched_at": "2024-01-01T12:00:00.000Z",
      "ids": {
        "trakt": 12345,
        "tvdb": 67890,
        "imdb": "tt1234567",
        "tmdb": 11111
      }
    }
  ]
}
```

**Response:** JSON object with added/updated counts

**Used in:**

- `trakt.rs::set_movie_watched()`
- `trakt.rs::set_episode_watched()`

---

## Prowlarr API Endpoints

**Base URL:** User-configured (e.g., `http://localhost:9696` or custom URL)

**Authentication:** API Key sent in `X-Api-Key` header

**Note:** Prowlarr is a self-hosted torrent indexer aggregator. The URL is configured by each user in the application settings.

---

### 1. Search Endpoints

#### GET `/api/v1/search`

**Description:** Search for torrents across all configured indexers in Prowlarr

**Method:** `GET`

**Headers:**

- `X-Api-Key: {PROWLARR_API_KEY}`

**Query Parameters:**

- `query` (string, required) - The search query (can be movie title or `imdbid:{imdb_id}` format)
- `type` (string, optional) - Content type filter (e.g., "movie", "tv")

**Query Examples:**

- Title search: `?query=Inception&type=movie`
- IMDB search: `?query=imdbid:1234567&type=movie`

**Response:** JSON array of torrent search results

**Response Schema:**

```json
[
  {
    "title": "Movie.Title.2024.1080p.BluRay.x264",
    "size": 2147483648,
    "seeders": 100,
    "peers": 50,
    "downloadUrl": "http://prowlarr:9696/api/v1/download/redirect/123",
    "magnetUrl": "http://prowlarr:9696/api/v1/magnet/redirect/123",
    "indexer": "ExampleIndexer",
    "publishDate": "2024-01-01T12:00:00Z"
  }
]
```

**Used in:** `torrent_search.rs::search_torrents_by_imdb()`

**Special Considerations:**

- Results are aggregated from multiple indexers
- Response time can vary based on number of indexers configured
- Default timeout: 30 seconds
- Results are sorted by seeders in the application

---

### 2. Download Endpoints

#### GET `/api/v1/download/redirect/{id}` (with redirect)

**Description:** Download torrent file via Prowlarr's redirect mechanism

**Method:** `GET`

**Headers:**

- `X-Api-Key: {PROWLARR_API_KEY}`

**Path Parameters:**

- `id` (string) - The download ID from search results

**Response:** HTTP Redirect (301/302/307/308) to actual torrent file or magnet link

**Redirect Targets:**

- May redirect to direct torrent file download URL
- May redirect to magnet link
- Follows indexer-specific download mechanisms

**Used in:** `torrent_search.rs::download_torrent_from_prowlarr()`

**Special Handling:**

- Client must NOT follow redirects automatically
- Must extract `Location` header manually
- If redirect target is `magnet:`, use directly
- If redirect target is HTTP(S), download the torrent file
- Send API key in initial request, not in redirect target request

---

#### GET `/api/v1/magnet/redirect/{id}` (with redirect)

**Description:** Get magnet link via Prowlarr's redirect mechanism

**Method:** `GET`

**Headers:**

- `X-Api-Key: {PROWLARR_API_KEY}`

**Path Parameters:**

- `id` (string) - The magnet ID from search results

**Response:** HTTP Redirect (301/302/307/308) to magnet link

**Redirect Target:**

- Always redirects to `magnet:` URI
- Contains full magnet link with trackers and info hash

**Used in:** `torrent_search.rs::download_torrent_from_prowlarr()`

**Special Handling:**

- Client must NOT follow redirects automatically
- Must extract `Location` header manually
- Verify redirect target starts with `magnet:`
- Send API key in initial request, not when following magnet link

---

## Static Asset Endpoints

### TMDB Image CDN

**Base URL:** `https://image.tmdb.org/t/p`

**Description:** Static image delivery for TMDB posters, backdrops, and other assets

**URL Pattern:** `https://image.tmdb.org/t/p/{size}{file_path}`

**Parameters:**

- `size` - Image size variant (e.g., "w185", "w500", "w1280", "original")
- `file_path` - The file path from TMDB API response (e.g., "/abc123.jpg")

**Examples:**

- Poster: `https://image.tmdb.org/t/p/w500/abc123.jpg`
- Backdrop: `https://image.tmdb.org/t/p/w1280/xyz789.jpg`

**Available Sizes:**

**Posters:**

- w92, w154, w185, w342, w500, w780, original

**Backdrops:**

- w300, w780, w1280, original

**Used in:**

- `tmdb.ts::buildTmdbImageUrlSync()`
- `Downloads.tsx` (direct image URLs)
- Throughout the application for displaying movie/show artwork

---

## Authentication Requirements

### TMDB Authentication

**Type:** Bearer Token (Read Access Token)

**Header Format:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

**Required for:** All TMDB API endpoints

**Token Storage:** Hardcoded in application (read-only access)

---

### Trakt Authentication

**Type:** OAuth 2.0 with Device Flow

**Common Headers Required:**

```
Content-Type: application/json
trakt-api-version: 2
trakt-api-key: {CLIENT_ID}
User-Agent: NachoTime/1.0.0
```

**Authenticated Endpoint Additional Header:**

```
Authorization: Bearer {ACCESS_TOKEN}
```

**Token Management:**

- Access tokens expire and need refresh using refresh_token
- Tokens stored locally in application data directory
- Device flow requires user authorization via web browser

---

### Prowlarr Authentication

**Type:** API Key

**Header Format:**

```
X-Api-Key: {PROWLARR_API_KEY}
```

**Required for:** All Prowlarr API endpoints

**Configuration:**

- User-configured in application settings
- Base URL is also user-configured (self-hosted instance)
- API key found in Prowlarr Settings → General → Security
- Each user has their own Prowlarr instance and API key

---

## Proxy Implementation Notes

### Request Forwarding Requirements

1. **Preserve Headers:** All authentication headers must be forwarded
2. **Query Parameters:** All query parameters must be preserved
3. **Request Body:** POST request bodies must be forwarded unchanged
4. **Response Codes:** Maintain original HTTP status codes from upstream APIs
5. **Content-Type:** Preserve content-type headers in responses

### Rate Limiting Considerations

1. **TMDB:** No explicit rate limits documented but should implement reasonable caching
2. **Trakt:**
   - Device polling has specific interval requirements
   - Status 429 indicates polling too quickly
   - Respect retry-after headers if present
3. **Prowlarr:**
   - User-configured instances may have different rate limits
   - Timeout set to 30 seconds for search requests
   - No documented rate limits (depends on user's instance configuration)

### Caching Strategy

**TMDB Endpoints (Cacheable):**

- Configuration: Long cache (24 hours)
- Movie/Show details: Medium cache (1 hour)
- Images: Long cache (24 hours)
- Search results: Short cache (5 minutes)

**Trakt Endpoints (Mostly Non-Cacheable):**

- OAuth endpoints: Never cache
- Trending lists: Short cache (5 minutes)
- User data: Never cache (sync endpoints)
- User settings: Short cache (1 minute)

**Prowlarr Endpoints (Non-Cacheable):**

- Search results: Never cache (real-time availability data)
- Download redirects: Never cache (single-use URLs)
- Magnet redirects: Never cache (single-use URLs)

**Note on Prowlarr:** Results contain real-time seeder/peer counts and availability, so caching would provide stale data. Download/magnet URLs may be time-sensitive or single-use.

### Error Handling

**Common Error Codes:**

- 400 - Bad Request (invalid parameters)
- 401 - Unauthorized (missing/invalid token)
- 404 - Not Found (resource doesn't exist)
- 429 - Rate Limited (slow down requests)
- 500 - Server Error (upstream API issue)

**Trakt-Specific Polling Errors:**

- 400 - Pending authorization (continue polling)
- 404 - Invalid device code
- 409 - Code already used
- 410 - Code expired
- 418 - User denied authorization

**Prowlarr-Specific Considerations:**

- 401 - Unauthorized (missing API key)
- 403 - Forbidden (invalid API key)
- Connection errors (user's instance may be offline or unreachable)
- Redirect handling (301/302/307/308 must be handled manually)
- Timeout handling (30 second default, may need adjustment per user)
- Base URL validation (user-configured, may be invalid)

---

## Summary Statistics

**Total Endpoints to Proxy:** 31

**TMDB Endpoints:** 13

- Configuration: 1
- Movies: 3
- TV Shows: 6
- Find: 1
- Search: 2

**Trakt Endpoints:** 15

- OAuth: 4
- User: 1
- Movies: 1
- TV Shows: 1
- Sync: 8

**Prowlarr Endpoints:** 3

- Search: 1
- Download Redirect: 1
- Magnet Redirect: 1

**Static Assets:** 1 domain (TMDB Image CDN)

---

## Testing Checklist

### TMDB API Tests

- [ ] GET configuration
- [ ] GET movie details
- [ ] GET movie images
- [ ] GET movie videos
- [ ] GET TV show details
- [ ] GET TV show images
- [ ] GET season details
- [ ] GET season images
- [ ] GET episode details
- [ ] GET episode external IDs
- [ ] GET find by IMDB (movie)
- [ ] GET find by IMDB (TV show)
- [ ] GET search movies
- [ ] GET search TV shows
- [ ] GET image assets (various sizes)

### Trakt API Tests

- [ ] POST device code generation
- [ ] POST device token polling (success)
- [ ] POST device token polling (pending)
- [ ] POST token refresh
- [ ] POST token revoke
- [ ] GET user settings/profile
- [ ] GET trending movies
- [ ] GET trending shows
- [ ] GET watched movies (authenticated)
- [ ] GET watched shows (authenticated)
- [ ] GET user watch history (authenticated)
- [ ] GET show watch history (authenticated)
- [ ] POST add movie to history (authenticated)
- [ ] POST add episode to history (authenticated)

### Prowlarr API Tests

- [ ] GET search by title (movie type)
- [ ] GET search by IMDB ID
- [ ] GET search with no type filter
- [ ] GET download redirect (to torrent file)
- [ ] GET download redirect (to magnet link)
- [ ] GET magnet redirect
- [ ] Handle redirect without following automatically
- [ ] Extract Location header from redirect
- [ ] Validate magnet link format
- [ ] Download torrent file after redirect
- [ ] Handle missing API key (401)
- [ ] Handle invalid API key (403)
- [ ] Handle connection to user-configured URL

### Authentication Tests

- [ ] TMDB bearer token validation
- [ ] Trakt OAuth flow end-to-end
- [ ] Token refresh flow
- [ ] Expired token handling
- [ ] Invalid token handling
- [ ] Prowlarr API key validation
- [ ] Prowlarr user-configured URL handling

### Edge Cases

- [ ] Rate limiting responses (429)
- [ ] Not found responses (404)
- [ ] Invalid parameters (400)
- [ ] Server errors (500)
- [ ] Network timeouts
- [ ] Malformed responses

---

**Document Version:** 1.1  
**Last Updated:** 2025-11-05  
**Application:** Nacho Time  
**Purpose:** API Proxy Implementation Reference

**Changelog:**

- v1.1 (2025-11-05): Added Prowlarr API endpoints documentation
- v1.0 (2025-11-05): Initial documentation with TMDB and Trakt endpoints
