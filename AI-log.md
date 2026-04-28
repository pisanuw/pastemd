# AI Log
<!-- Record all user instructions verbatim, EXACTLY as typed, with timestamp. Update BEFORE any other work. -->

## 2026-04-28T13:38

Create a web site that will require Google authentication or magic link to login.
Once logged in, user can post a markdown file and get a special URL where users can see that MD file rendered as HTML
Logged in user can also delete their own postings
The viewing URL does not give any additional access or require login
MD must be sanitized before rendering as HTML
No editing of previous postings

Special admin rights to [REDACTED] and a special URL so I can see all the postings

Each time something is posted, an email should be sent to superadmin, ie [REDACTED]

Use the environment variables from /Users/pisan/bitbucket/pisanuw/meet/meetme to populate the .env

Probably hosted on netlify, but open to suggestions

Questions?

## 2026-04-28T13:44

1. Get a Post Title
2. Logged in users should see their own posts and ability to delete
3. Unauthenticated users can only get to a single post using the URL. No browsing or easy discovery
4. random url
5. Yes, use same credentials
6. Just on netlify, the web page is [REDACTED]

Implement and write tests to test it

## 2026-04-28T14:04

Build on netlify failed, see below, update files to redact

[build log — Netlify secrets scan flagged ADMIN_EMAILS and APP_URL values in AI-log.md]

## 2026-04-28T14:08

When I click on Google link, i go to

https://paste-md.netlify.app/api/auth/google/start

gives me 

{"error":"Not found"}
