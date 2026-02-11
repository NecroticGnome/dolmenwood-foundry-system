# Release Workflow

This repository uses automated GitHub Actions to streamline the release process.

## How It Works

### 1. Create GitHub Release (Automated)
**Trigger:** Push to `main` branch that changes `version.txt`

When you update the version number in `version.txt` and push to main, a GitHub Actions workflow automatically:
- Creates a **draft release** on GitHub
- Tags it with the version number from `version.txt`
- Packages the system files

### 2. Foundry Manifest Update (Automated)
**Trigger:** Publishing a release on GitHub

When you publish the draft release, another workflow automatically:
- Updates `system.json` with the new version number
- Updates the `download` and `manifest` URLs to point to the new release
- Commits these changes back to the main branch

## Release Process Step-by-Step

1. **Update version.txt**
   ```bash
   # Edit version.txt to contain the new version (e.g., 0.2.0)
   echo "0.2.0" > version.txt
   ```

2. **Commit and push to main**
   ```bash
   git add version.txt
   git commit -m "Release v0.2.0"
   git push origin main
   ```

3. **Wait for workflow #1 to complete**
   - Go to the "Actions" tab on GitHub
   - Watch the "Create GitHub Release" workflow run
   - This creates a draft release

4. **Edit the draft release**
   - Go to the "Releases" page on GitHub
   - Find your draft release
   - Add release notes, changelog, breaking changes, etc.

5. **Publish the release**
   - Click "Publish release" button
   - Workflow #2 automatically runs
   - Your `system.json` is updated with new URLs

6. **Done!**
   - Users can now download the new version from GitHub
   - The manifest URLs point to the latest release

## Important Notes

- Always update `version.txt` **before** creating a release
- The version in `version.txt` should match semantic versioning (e.g., `0.2.0`, `1.0.0`)
- Don't manually edit the `version`, `manifest`, or `download` fields in `system.json` - the workflow handles this
- The workflows require `contents: write` permissions (enabled by default)

## Troubleshooting

**Workflow doesn't trigger:**
- Make sure you pushed to the `main` branch
- Verify that `version.txt` was actually changed in the commit

**Release not created:**
- Check the Actions tab for error messages
- Ensure you have the proper permissions on the repository

**Manifest not updated:**
- Make sure you **published** the release (not just created a draft)
- Check the Actions tab for the "Foundry Manifest Update" workflow
