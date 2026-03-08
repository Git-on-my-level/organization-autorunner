module organization-autorunner-cli

go 1.23.0

require (
	github.com/pmezard/go-difflib v1.0.0
	organization-autorunner-contracts-go-client v0.0.0
)

replace organization-autorunner-contracts-go-client => ../contracts/gen/go
