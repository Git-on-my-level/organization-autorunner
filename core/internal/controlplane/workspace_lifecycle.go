package controlplane

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (s *Service) GetWorkspaceRoutingManifest(ctx context.Context, identity RequestIdentity, workspaceID string) (WorkspaceRoutingManifest, error) {
	workspace, _, err := s.requireWorkspaceAccess(ctx, identity, workspaceID, true)
	if err != nil {
		return WorkspaceRoutingManifest{}, err
	}
	return s.workspaceRoutingManifest(workspace), nil
}

func (s *Service) SuspendWorkspace(ctx context.Context, identity RequestIdentity, workspaceID string) (Workspace, ProvisioningJob, error) {
	return s.transitionWorkspaceState(ctx, identity, workspaceID, "workspace_suspend", "suspended", "suspended", "workspace suspended")
}

func (s *Service) ResumeWorkspace(ctx context.Context, identity RequestIdentity, workspaceID string) (Workspace, ProvisioningJob, error) {
	return s.transitionWorkspaceState(ctx, identity, workspaceID, "workspace_resume", "ready", "ready", "workspace resumed")
}

func (s *Service) DecommissionWorkspace(ctx context.Context, identity RequestIdentity, workspaceID string) (Workspace, ProvisioningJob, error) {
	return s.transitionWorkspaceState(ctx, identity, workspaceID, "workspace_decommission", "archived", "archived", "workspace decommissioned")
}

func (s *Service) RestoreWorkspace(ctx context.Context, identity RequestIdentity, workspaceID string, backupDir string) (Workspace, ProvisioningJob, error) {
	return s.restoreOrReplaceWorkspace(ctx, identity, workspaceID, backupDir, "workspace_restore")
}

func (s *Service) ReplaceWorkspace(ctx context.Context, identity RequestIdentity, workspaceID string, backupDir string) (Workspace, ProvisioningJob, error) {
	return s.restoreOrReplaceWorkspace(ctx, identity, workspaceID, backupDir, "workspace_replace")
}

func (s *Service) transitionWorkspaceState(ctx context.Context, identity RequestIdentity, workspaceID string, kind string, desiredState string, currentState string, progress string) (Workspace, ProvisioningJob, error) {
	workspace, membership, err := s.requireWorkspaceAccess(ctx, identity, workspaceID, true)
	if err != nil {
		return Workspace{}, ProvisioningJob{}, err
	}
	if membership.Status != "active" {
		return Workspace{}, ProvisioningJob{}, accessDenied("workspace membership is disabled")
	}

	now := s.now()
	nowText := now.Format(time.RFC3339Nano)
	workspace.DesiredState = desiredState
	job := ProvisioningJob{
		ID:              "job_" + uuid.NewString(),
		OrganizationID:  workspace.OrganizationID,
		WorkspaceID:     workspace.ID,
		Kind:            kind,
		Status:          "running",
		RequestedAt:     nowText,
		StartedAt:       stringPtr(nowText),
		ProgressMessage: "workspace state transition started",
		Retryable:       true,
		Parameters: map[string]any{
			"requested_state": desiredState,
			"current_state":   workspace.Status,
		},
	}
	if workspace.Status == currentState {
		job.Status = "succeeded"
		job.ProgressMessage = progress + " (already applied)"
		job.FinishedAt = stringPtr(nowText)
		job.Retryable = false
		job.Result = map[string]any{
			"current_state": workspace.Status,
			"desired_state": workspace.DesiredState,
		}
	} else {
		workspace.Status = currentState
		workspace.UpdatedAt = nowText
		job.Status = "succeeded"
		job.ProgressMessage = progress
		job.FinishedAt = stringPtr(nowText)
		job.Retryable = false
		job.Result = map[string]any{
			"current_state": workspace.Status,
			"desired_state": workspace.DesiredState,
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to begin workspace state transition")
	}
	defer tx.Rollback()
	if err := s.insertProvisioningJob(ctx, tx, job); err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to create workspace lifecycle job")
	}
	if workspace.Status != currentState {
		if err := s.persistWorkspaceRoutingManifest(ctx, tx, workspace); err != nil {
			return Workspace{}, ProvisioningJob{}, err
		}
	}
	if err := s.updateProvisioningJob(ctx, tx, job); err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to update workspace lifecycle job")
	}
	if err := insertAuditEventTx(ctx, tx, AuditEvent{
		ID:             "audit_" + uuid.NewString(),
		EventType:      kind + "_recorded",
		OrganizationID: stringPtr(workspace.OrganizationID),
		WorkspaceID:    stringPtr(workspace.ID),
		TargetType:     "provisioning_job",
		TargetID:       job.ID,
		OccurredAt:     nowText,
		Metadata: map[string]any{
			"status": job.Status,
			"kind":   job.Kind,
		},
	}, stringPtr(identity.Account.ID)); err != nil {
		return Workspace{}, ProvisioningJob{}, err
	}
	if err := tx.Commit(); err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to commit workspace lifecycle job")
	}
	return workspace, job, nil
}

func (s *Service) restoreOrReplaceWorkspace(ctx context.Context, identity RequestIdentity, workspaceID string, backupDir string, kind string) (Workspace, ProvisioningJob, error) {
	workspace, membership, err := s.requireWorkspaceAccess(ctx, identity, workspaceID, true)
	if err != nil {
		return Workspace{}, ProvisioningJob{}, err
	}
	if membership.Status != "active" {
		return Workspace{}, ProvisioningJob{}, accessDenied("workspace membership is disabled")
	}
	backupDir = strings.TrimSpace(backupDir)
	if backupDir == "" {
		return Workspace{}, ProvisioningJob{}, invalidRequest("backup_dir is required")
	}

	now := s.now()
	nowText := now.Format(time.RFC3339Nano)
	job := ProvisioningJob{
		ID:              "job_" + uuid.NewString(),
		OrganizationID:  workspace.OrganizationID,
		WorkspaceID:     workspace.ID,
		Kind:            kind,
		Status:          "running",
		RequestedAt:     nowText,
		StartedAt:       stringPtr(nowText),
		ProgressMessage: "restoring workspace deployment",
		Retryable:       true,
		Parameters: map[string]any{
			"backup_dir":       backupDir,
			"instance_root":    workspace.DeploymentRoot,
			"public_origin":    s.workspacePublicOrigin(workspace),
			"workspace_path":   workspace.WorkspacePath,
			"workspace_status": workspace.Status,
		},
	}

	if err := ensureWorkspaceDeploymentDirs(workspace); err != nil {
		return Workspace{}, ProvisioningJob{}, err
	}
	workspace.DesiredState = "ready"

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to begin restore job")
	}
	defer tx.Rollback()
	if err := s.insertProvisioningJob(ctx, tx, job); err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to create restore job")
	}
	if err := tx.Commit(); err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to commit restore job start")
	}

	restoreResult, restoreErr := s.runRestoreWorkspaceScript(ctx, workspace, backupDir)
	verifyResult := scriptResult{}
	if restoreErr == nil {
		var verifyErr error
		verifyResult, verifyErr = s.runVerifyRestoreScript(ctx, workspace)
		if verifyErr != nil {
			restoreErr = verifyErr
		}
	}
	if restoreErr == nil {
		workspace.Status = "ready"
		workspace.DesiredState = "ready"
		workspace.UpdatedAt = s.now().Format(time.RFC3339Nano)
		job.Status = "succeeded"
		job.FinishedAt = stringPtr(workspace.UpdatedAt)
		job.ProgressMessage = "workspace restore completed"
		job.StdoutTail = restoreResult.StdoutTail
		job.StderrTail = restoreResult.StderrTail
		job.Retryable = false
		if verifyResult.StdoutTail != "" || verifyResult.StderrTail != "" {
			job.Result = map[string]any{
				"backup_dir":   backupDir,
				"verification": "run",
				"verification_tail": map[string]any{
					"stdout": verifyResult.StdoutTail,
					"stderr": verifyResult.StderrTail,
				},
			}
		} else {
			job.Result = map[string]any{
				"backup_dir":   backupDir,
				"verification": "skipped",
			}
		}
	} else {
		workspace.Status = "degraded"
		workspace.UpdatedAt = s.now().Format(time.RFC3339Nano)
		job.Status = "failed"
		job.FinishedAt = stringPtr(workspace.UpdatedAt)
		job.FailureReason = stringPtr(strings.TrimSpace(restoreErr.Error()))
		job.ProgressMessage = "workspace restore failed"
		job.StdoutTail = restoreResult.StdoutTail
		job.StderrTail = restoreResult.StderrTail
		if verifyResult.StdoutTail != "" || verifyResult.StderrTail != "" {
			if job.StdoutTail != "" {
				job.StdoutTail += "\n"
			}
			job.StdoutTail += verifyResult.StdoutTail
			if job.StderrTail != "" {
				job.StderrTail += "\n"
			}
			job.StderrTail += verifyResult.StderrTail
		}
		job.Retryable = true
		job.Result = map[string]any{
			"backup_dir":        backupDir,
			"restore_exit_code": restoreResult.ExitCode,
			"verify_exit_code":  verifyResult.ExitCode,
		}
	}

	tx, err = s.db.BeginTx(ctx, nil)
	if err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to begin restore job finalization")
	}
	defer tx.Rollback()
	if err := s.persistWorkspaceRoutingManifest(ctx, tx, workspace); err != nil {
		return Workspace{}, ProvisioningJob{}, err
	}
	if err := s.updateProvisioningJob(ctx, tx, job); err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to update restore job")
	}
	if err := insertAuditEventTx(ctx, tx, AuditEvent{
		ID:             "audit_" + uuid.NewString(),
		EventType:      kind + "_finished",
		OrganizationID: stringPtr(workspace.OrganizationID),
		WorkspaceID:    stringPtr(workspace.ID),
		TargetType:     "provisioning_job",
		TargetID:       job.ID,
		OccurredAt:     workspace.UpdatedAt,
		Metadata: map[string]any{
			"status":     job.Status,
			"kind":       job.Kind,
			"backup_dir": backupDir,
		},
	}, stringPtr(identity.Account.ID)); err != nil {
		return Workspace{}, ProvisioningJob{}, err
	}
	if err := tx.Commit(); err != nil {
		return Workspace{}, ProvisioningJob{}, internalError("failed to commit restore job finalization")
	}
	return workspace, job, nil
}
