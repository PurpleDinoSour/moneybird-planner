# Moneybird Planner IV - HTTP Server
# Version: 1.0.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Web

$port = 8000
$url = "http://localhost:$port/"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Moneybird Planner IV Server" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting server at: $url" -ForegroundColor Yellow
Write-Host "Serving from: $scriptDir" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Red

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
} catch {
    Write-Host "Error: Port $port is already in use. Close the other server first." -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1
Start-Process "${url}index.html"

Write-Host "Server is running..." -ForegroundColor Green

# MIME type mapping
$mimeTypes = @{
    ".html"  = "text/html; charset=utf-8"
    ".htm"   = "text/html; charset=utf-8"
    ".css"   = "text/css; charset=utf-8"
    ".js"    = "application/javascript; charset=utf-8"
    ".json"  = "application/json"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".jpeg"  = "image/jpeg"
    ".gif"   = "image/gif"
    ".svg"   = "image/svg+xml"
    ".ico"   = "image/x-icon"
    ".woff"  = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"   = "font/ttf"
}

function Get-MimeType {
    param($filePath)
    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
    if ($mimeTypes.ContainsKey($ext)) {
        return $mimeTypes[$ext]
    }
    return "application/octet-stream"
}

function Invoke-GitCustomerConfigSync {
    param(
        [string[]]$Arguments
    )

    $output = & git -C $scriptDir @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    return @{
        Success  = ($exitCode -eq 0)
        Output   = ($output -join "`n")
        ExitCode = $exitCode
    }
}

function Get-CustomerConfig {
    $configFile = Join-Path $scriptDir "customer-config.template.json"
    if (Test-Path (Join-Path $scriptDir ".git")) {
        $pullResult = Invoke-GitCustomerConfigSync -Arguments @("pull", "--ff-only", "origin", "main")
        if ($pullResult.Success) {
            Write-Host "Synced shared customer config from origin/main" -ForegroundColor Green
        } else {
            Write-Host "Customer config pull skipped: $($pullResult.Output)" -ForegroundColor Yellow
        }
    }
    if (-not (Test-Path $configFile)) {
        return @{ customers = @(); lastModified = $null }
    }
    try {
        $content = Get-Content -Path $configFile -Raw
        return $content | ConvertFrom-Json
    } catch {
        Write-Host "Error reading customer-config.template.json: $_" -ForegroundColor Red
        return @{ customers = @(); lastModified = $null }
    }
}

function Set-CustomerConfig {
    param($data)

    $configFile = Join-Path $scriptDir "customer-config.template.json"
    try {
        $json = $data | ConvertTo-Json -Depth 3
        Set-Content -Path $configFile -Value $json -Force

        $addResult = Invoke-GitCustomerConfigSync -Arguments @("add", "customer-config.template.json")
        if (-not $addResult.Success) {
            return @{ success = $false; error = "Unable to stage shared customer config" }
        }

        & git -C $scriptDir diff --cached --quiet -- "customer-config.template.json"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Shared customer config unchanged" -ForegroundColor Yellow
            return @{ success = $true; synced = $true; changed = $false }
        }

        $commitMessage = "chore(customer-config): sync shared customer profiles"
        $commitResult = Invoke-GitCustomerConfigSync -Arguments @("commit", "-m", $commitMessage, "--", "customer-config.template.json")
        if (-not $commitResult.Success) {
            return @{ success = $false; error = "Unable to commit shared customer config"; details = $commitResult.Output }
        }

        $pushResult = Invoke-GitCustomerConfigSync -Arguments @("push", "origin", "main")
        if (-not $pushResult.Success) {
            return @{ success = $false; error = "Saved locally but push failed. Open the repo and resolve git sync."; details = $pushResult.Output }
        }

        Write-Host "Saved and pushed shared customer config" -ForegroundColor Green
        return @{ success = $true; synced = $true; changed = $true }
    } catch {
        Write-Host "Error saving customer-config.template.json: $_" -ForegroundColor Red
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Get-AzureDevOpsCommits {
    param($token, $username, $password, $org, $project, $repo, $fromDate, $toDate)
    if (-not $org -or -not $project -or -not $repo) {
        Write-Host "Azure: Missing org/project/repo" -ForegroundColor Yellow
        return '{"error":"Missing org, project, or repo"}'
    }
    $apiUrl = "https://dev.azure.com/$org/$project/_apis/git/repositories/$repo/commits?api-version=7.0"
    if ($fromDate) {
        $apiUrl += "&searchCriteria.fromDate=$fromDate"
    }
    if ($toDate) {
        $apiUrl += "&searchCriteria.toDate=$toDate"
    }
    Write-Host "Azure API: $apiUrl" -ForegroundColor Magenta
    $headers = @{}

    if ($password -and $username) {
        $authString = "${username}:${password}"
        $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($authString))
        $headers["Authorization"] = "Basic $base64Auth"
        Write-Host "Using password auth for: $username" -ForegroundColor Yellow
    } elseif ($token) {
        $authString = if ($username) {
            "${username}:${token}"
        } else {
            ":${token}"
        }
        $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($authString))
        $headers["Authorization"] = "Basic $base64Auth"
        Write-Host "Using PAT auth" -ForegroundColor Yellow
    } else {
        Write-Host "WARNING: No auth provided!" -ForegroundColor Red
    }

    try {
        $resp = Invoke-RestMethod -Uri $apiUrl -Headers $headers -UseBasicParsing
        Write-Host "Found $($resp.value.Count) commits" -ForegroundColor Green
        return ($resp | ConvertTo-Json -Compress -Depth 10)
    } catch {
        Write-Host "Azure commits error: $_" -ForegroundColor Red
        return '{"error":"' + $_.Exception.Message.Replace('"', '\"') + '"}'
    }
}

function Get-AzureDevOpsProjects {
    param($token, $username, $password, $org)
    if (-not $org) {
        Write-Host "Azure Projects: Missing org" -ForegroundColor Yellow
        return '{"error":"Missing organization"}'
    }
    $apiUrl = "https://dev.azure.com/$org/_apis/projects?api-version=7.0"
    Write-Host "Azure Projects API: $apiUrl" -ForegroundColor Magenta
    $headers = @{}

    if ($password -and $username) {
        $authString = "${username}:${password}"
        $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($authString))
        $headers["Authorization"] = "Basic $base64Auth"
        Write-Host "Using password auth for: $username" -ForegroundColor Yellow
    } elseif ($token) {
        $authString = if ($username) {
            "${username}:${token}"
        } else {
            ":${token}"
        }
        $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($authString))
        $headers["Authorization"] = "Basic $base64Auth"
        Write-Host "Using PAT auth" -ForegroundColor Yellow
    } else {
        Write-Host "WARNING: No auth provided!" -ForegroundColor Red
    }

    try {
        $resp = Invoke-RestMethod -Uri $apiUrl -Headers $headers -UseBasicParsing
        $result = @()
        foreach ($proj in $resp.value) {
            $result += @{name = $proj.name; id = $proj.id }
        }
        Write-Host "Found $($result.Count) projects" -ForegroundColor Green
        return (@{value = $result } | ConvertTo-Json -Compress -Depth 3)
    } catch {
        Write-Host "Azure projects error: $_" -ForegroundColor Red
        return '{"error":"' + $_.Exception.Message.Replace('"', '\"') + '"}'
    }
}

function Get-AzureDevOpsPRs {
    param($token, $username, $password, $org, $project, $repo, $fromDate, $toDate)
    if (-not $org -or -not $project -or -not $repo) {
        return '{"error":"Missing org, project, or repo"}'
    }
    $apiUrl = "https://dev.azure.com/$org/$project/_apis/git/repositories/$repo/pullrequests?api-version=7.0&searchCriteria.status=all"
    Write-Host "Azure PR API: $apiUrl" -ForegroundColor Magenta
    Write-Host "Date filter: $fromDate to $toDate" -ForegroundColor Yellow
    $headers = @{}

    if ($password -and $username) {
        $authString = "${username}:${password}"
        $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($authString))
        $headers["Authorization"] = "Basic $base64Auth"
    } elseif ($token) {
        $authString = if ($username) {
            "${username}:${token}"
        } else {
            ":${token}"
        }
        $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($authString))
        $headers["Authorization"] = "Basic $base64Auth"
    }

    try {
        $resp = Invoke-RestMethod -Uri $apiUrl -Headers $headers -UseBasicParsing
        $filteredPRs = @()
        foreach ($pr in $resp.value) {
            if ($fromDate -or $toDate) {
                $prDate = $pr.creationDate
                if ($prDate) {
                    $prDateTime = [DateTime]::Parse($prDate)
                    if ($fromDate) {
                        $fromDateTime = [DateTime]::Parse($fromDate)
                        if ($prDateTime -lt $fromDateTime) {
                            continue
                        }
                    }
                    if ($toDate) {
                        $toDateTime = [DateTime]::Parse($toDate)
                        if ($prDateTime -gt $toDateTime) {
                            continue
                        }
                    }
                }
            }
            $filteredPRs += $pr
        }
        Write-Host "Found $($filteredPRs.Count) PRs (after date filter)" -ForegroundColor Green
        return (@{value = $filteredPRs; count = $filteredPRs.Count } | ConvertTo-Json -Compress -Depth 10)
    } catch {
        Write-Host "Azure PRs error: $_" -ForegroundColor Red
        return '{"error":"' + $_.Exception.Message.Replace('"', '\"') + '"}'
    }
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, PATCH, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization, X-GitHub-Token, X-Azure-Token, X-Azure-Username, X-Azure-Password, X-Moneybird-Token")
        $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
        $response.Headers.Add("Pragma", "no-cache")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.OutputStream.Close()
            continue
        }

        $requestedFile = $request.Url.LocalPath.TrimStart('/')
        $queryString = $request.Url.Query

        # Default to index.html
        if ($requestedFile -eq "") {
            $requestedFile = "index.html"
        }

        Write-Host "$(Get-Date -Format 'HH:mm:ss') - $requestedFile" -ForegroundColor Cyan

        # Parse Authorization header
        $authHeader = $request.Headers["Authorization"]
        $parsedToken = $null
        $parsedUser = $null
        if ($authHeader -and $authHeader.StartsWith("Basic ")) {
            try {
                $base64 = $authHeader.Substring(6)
                $decoded = [System.Text.Encoding]::ASCII.GetString([Convert]::FromBase64String($base64))
                $parts = $decoded -split ':', 2
                if ($parts.Length -eq 2) {
                    $parsedUser = $parts[0]
                    $parsedToken = $parts[1]
                    Write-Host "Parsed auth header: user=$parsedUser" -ForegroundColor DarkGray
                }
            } catch {
                Write-Host "Failed to parse Authorization header" -ForegroundColor Yellow
            }
        }

        # API Routes
        if ($requestedFile -eq "git/commits") {
            # Legacy route - return empty array
            $json = '[]'
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($requestedFile -eq "github/prs") {
            # Legacy route - return empty array
            $json = '[]'
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($requestedFile -eq "azure/commits" -or $requestedFile -eq "azure-commits") {
            $azToken = if ($request.Headers["X-Azure-Token"]) {
                $request.Headers["X-Azure-Token"]
            } else {
                $parsedToken
            }
            $azUser = if ($request.Headers["X-Azure-Username"]) {
                $request.Headers["X-Azure-Username"]
            } else {
                $parsedUser
            }
            $azPass = $request.Headers["X-Azure-Password"]
            $azOrg = $null; $azProj = $null; $azRepo = $null; $fromDate = $null; $toDate = $null
            if ($queryString -match 'org=([^&]+)') {
                $azOrg = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'project=([^&]+)') {
                $azProj = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'repo=([^&]+)') {
                $azRepo = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'fromDate=([^&]+)') {
                $fromDate = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'toDate=([^&]+)') {
                $toDate = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            Write-Host "Azure request: Org=$azOrg, Project=$azProj, Repo=$azRepo" -ForegroundColor Yellow
            $json = Get-AzureDevOpsCommits -token $azToken -username $azUser -password $azPass -org $azOrg -project $azProj -repo $azRepo -fromDate $fromDate -toDate $toDate
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($requestedFile -eq "azure/prs" -or $requestedFile -eq "azure-prs") {
            $azToken = if ($request.Headers["X-Azure-Token"]) {
                $request.Headers["X-Azure-Token"]
            } else {
                $parsedToken
            }
            $azUser = if ($request.Headers["X-Azure-Username"]) {
                $request.Headers["X-Azure-Username"]
            } else {
                $parsedUser
            }
            $azPass = $request.Headers["X-Azure-Password"]
            $azOrg = $null; $azProj = $null; $azRepo = $null; $fromDate = $null; $toDate = $null
            if ($queryString -match 'org=([^&]+)') {
                $azOrg = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'project=([^&]+)') {
                $azProj = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'repo=([^&]+)') {
                $azRepo = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'fromDate=([^&]+)') {
                $fromDate = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            if ($queryString -match 'toDate=([^&]+)') {
                $toDate = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            $json = Get-AzureDevOpsPRs -token $azToken -username $azUser -password $azPass -org $azOrg -project $azProj -repo $azRepo -fromDate $fromDate -toDate $toDate
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($requestedFile -like "moneybird/*") {
            # Proxy Moneybird API calls to avoid CORS
            $mbPath = $requestedFile.Substring(10) # strip "moneybird/"
            $mbToken = $request.Headers["X-Moneybird-Token"]
            $mbUrl = "https://moneybird.com/api/v2/$mbPath"
            if ($queryString) {
                $mbUrl += $queryString
            }
            Write-Host "Moneybird proxy: $($request.HttpMethod) $mbUrl" -ForegroundColor Magenta

            $mbHeaders = @{
                "Authorization" = "Bearer $mbToken"
                "Content-Type"  = "application/json"
            }

            try {
                $mbReq = [System.Net.HttpWebRequest]::Create($mbUrl)
                $mbReq.Method = $request.HttpMethod
                $mbReq.Headers.Add("Authorization", "Bearer $mbToken")
                $mbReq.ContentType = "application/json"

                if ($request.HttpMethod -eq "POST" -or $request.HttpMethod -eq "PUT" -or $request.HttpMethod -eq "PATCH") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream)
                    $body = $reader.ReadToEnd()
                    $reader.Close()
                    if ($body) {
                        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                        $mbReq.ContentLength = $bodyBytes.Length
                        $reqStream = $mbReq.GetRequestStream()
                        $reqStream.Write($bodyBytes, 0, $bodyBytes.Length)
                        $reqStream.Close()
                    }
                }

                $mbWebResp = $mbReq.GetResponse()
                $respStream = $mbWebResp.GetResponseStream()
                $respReader = New-Object System.IO.StreamReader($respStream)
                $json = $respReader.ReadToEnd()
                $respReader.Close()
                $mbWebResp.Close()
                if (-not $json) {
                    $json = '{}'
                }
            } catch [System.Net.WebException] {
                $webEx = $_.Exception
                $statusCode = 500
                $json = $null
                if ($webEx.Response) {
                    $statusCode = [int]$webEx.Response.StatusCode
                    try {
                        $errStream = $webEx.Response.GetResponseStream()
                        $errReader = New-Object System.IO.StreamReader($errStream)
                        $json = $errReader.ReadToEnd()
                        $errReader.Close()
                        $webEx.Response.Close()
                    } catch {
                        $json = $null
                    }
                }
                if (-not $json) {
                    $json = '{"error":"' + $webEx.Message.Replace('"', "'").Replace("`r", "").Replace("`n", " ") + '"}'
                }
                Write-Host "Moneybird error ($statusCode): $json" -ForegroundColor Red
                $response.StatusCode = $statusCode
            }

            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($requestedFile -eq "azure/test" -or $requestedFile -eq "azure/projects" -or $requestedFile -eq "azure-projects") {
            $azToken = if ($request.Headers["X-Azure-Token"]) {
                $request.Headers["X-Azure-Token"]
            } else {
                $parsedToken
            }
            $azUser = if ($request.Headers["X-Azure-Username"]) {
                $request.Headers["X-Azure-Username"]
            } else {
                $parsedUser
            }
            $azPass = $request.Headers["X-Azure-Password"]
            $azOrg = $null
            if ($queryString -match 'org=([^&]+)') {
                $azOrg = [System.Web.HttpUtility]::UrlDecode($matches[1])
            }
            Write-Host "Azure test/projects: Org=$azOrg" -ForegroundColor Yellow
            $json = Get-AzureDevOpsProjects -token $azToken -username $azUser -password $azPass -org $azOrg
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($requestedFile -eq "api/config/customers") {
            # GET customer configs
            $config = Get-CustomerConfig
            $json = $config | ConvertTo-Json -Depth 3
            Write-Host "Serving customer configs" -ForegroundColor Cyan
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($requestedFile -eq "api/config/customers/save") {
            # POST to save customer configs
            if ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                $reader.Close()
                try {
                    $data = $body | ConvertFrom-Json
                    $result = Set-CustomerConfig $data
                    $json = $result | ConvertTo-Json -Depth 3
                    $response.StatusCode = if ($result.success) {
                        200 
                    } else {
                        409 
                    }
                } catch {
                    Write-Host "Error processing customer config save: $_" -ForegroundColor Red
                    $json = @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
                    $response.StatusCode = 400
                }
            } else {
                $response.StatusCode = 405
                $json = '{"error":"Only POST allowed"}'
            }
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif (Test-Path $requestedFile) {
            # Serve static files - validate path is under script directory
            $resolvedPath = (Resolve-Path $requestedFile -ErrorAction SilentlyContinue).Path
            if (-not $resolvedPath -or -not $resolvedPath.StartsWith($scriptDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                Write-Host "Blocked path traversal: $requestedFile" -ForegroundColor Red
                $response.StatusCode = 403
                $msg = "Forbidden"
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($msg)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.OutputStream.Close()
                continue
            }

            $mimeType = Get-MimeType $resolvedPath

            if ($mimeType -like "text/*" -or $mimeType -like "*javascript*" -or $mimeType -eq "application/json") {
                # Text files - read as UTF8
                $content = Get-Content $resolvedPath -Raw -Encoding UTF8
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
            } else {
                # Binary files
                $buffer = [System.IO.File]::ReadAllBytes($resolvedPath)
            }

            $response.ContentType = $mimeType
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } else {
            # 404 Not Found
            Write-Host "Not found: $requestedFile" -ForegroundColor Red
            $response.StatusCode = 404
            $msg = "Not found: $requestedFile"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($msg)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $response.OutputStream.Close()
    }
} finally {
    Write-Host "`nStopping server..." -ForegroundColor Yellow
    $listener.Stop()
    $listener.Close()
    Write-Host "Server stopped." -ForegroundColor Green
}
