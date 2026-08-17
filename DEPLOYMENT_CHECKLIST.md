# Class Pulse — Deployment Checklist

Firebase project already configured in this package:
- Project: `std-manage-45d25`
- Google Authentication: enabled
- Anonymous Authentication: enabled
- Firestore: Standard edition
- Firestore location: `nam5 (United States)`
- Firestore production mode
- Custom `firestore.rules` ready

## Deploy to GitHub Pages
1. Create a GitHub repository, e.g. `class-pulse`.
2. Upload all files from this ZIP to the repository root.
3. GitHub > Settings > Pages.
4. Build and deployment: **Deploy from a branch**.
5. Branch: `main`; Folder: `/ (root)`.
6. Save and wait for the site to publish.

Expected URLs:
- Student: `https://YOUR-USERNAME.github.io/class-pulse/`
- Instructor: `https://YOUR-USERNAME.github.io/class-pulse/instructor.html`

## Authorize yourself as instructor
1. Open the published `instructor.html`.
2. Click **Sign in with Google** once.
3. Firebase > Authentication > Users: copy your Google user's **User UID**.
4. Firestore > Data > **Start collection**.
5. Collection ID: `instructors`
6. Document ID: paste your exact Firebase User UID.
7. Add field:
   - Field: `enabled`
   - Type: Boolean
   - Value: `true`
8. Save.
9. Refresh the instructor page.

## If Google sign-in reports an unauthorized domain
Firebase > Authentication > Settings > Authorized domains:
add `YOUR-USERNAME.github.io`.

## Important
- Do not upload any Firebase service-account JSON file or private server key.
- Public IP is only supporting attendance evidence; many students on campus Wi-Fi may share one public IP.
