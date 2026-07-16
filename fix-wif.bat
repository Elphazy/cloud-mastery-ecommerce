@echo off
echo Running WIF binding...
gcloud iam service-accounts add-iam-policy-binding github-deploy-sa@elphas-wanyonyi-4590.iam.gserviceaccount.com --project="elphas-wanyonyi-4590" --role="roles/iam.workloadIdentityUser" --member="principalSet://://googleapis.com"
echo.
echo Fixing OIDC Issuer URL...
gcloud iam workload-identity-pools providers update-oidc "github-provider-v1" --location="global" --project="elphas-wanyonyi-4590" --workload-identity-pool="github-pool-v1" --issuer-uri="https://githubusercontent.com"
pause
