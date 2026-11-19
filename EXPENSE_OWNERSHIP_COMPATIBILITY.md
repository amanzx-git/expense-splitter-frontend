# Expense ownership compatibility — Shared Contract R1.2

This frontend refinement does not change expense permissions or backend behavior.

R1.2 invariant 5 and the expense endpoint table authorize the **creator or group admin** to edit and soft-delete an **unassigned** expense. Expenses assigned to any settlement cannot be edited or deleted, including when the settlement is still pending. The frontend retains those controls only for the authorized roles and records.

R1.2 invariant 6 permits an accepted member as payer; that payer may differ from the creator and need not be a share participant. The backend assigns `created_by` from the authenticated request user. The frontend never accepts a caller-supplied creator. Card ownership uses `created_by.id`, not `paid_by.id`; missing creator data remains neutrally aligned.

The requested self-payer-only, no-edit-after-save, and creator-only deletion policies conflict with these approved rules. They require separate approval to amend R1.2 and align backend enforcement: payer validation in `ExpenseInputSerializer`, edit authorization in `ExpenseDetailView.patch`, and creator/admin mutation rules in `ExpenseAPI.writable` / deletion. Corresponding backend and frontend permission tests would need updating. Simply hiding controls would not enforce those policies.

Compatible changes completed here: header Discussion, bottom authoritative balance/payment summaries and Add expense, creator-based card alignment, and shared accessible X controls. No backend or contract files were modified.
