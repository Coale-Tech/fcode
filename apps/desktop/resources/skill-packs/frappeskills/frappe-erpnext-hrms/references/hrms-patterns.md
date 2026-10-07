# Frappe HRMS Complete Reference

Comprehensive reference for Frappe HRMS: Employee Management, Leave, Attendance, Payroll, Recruitment, Performance, and Expenses.

---

## Overview

Frappe HRMS ("Frappe HR") is an HR and Payroll app built on the Frappe Framework. It is **not standalone**: `hooks.py` declares `required_apps = ["frappe/erpnext"]`, and payroll GL posting reuses ERPNext's Journal Entry / accounting stack. This reference is verified against **HRMS 16.4.1** (`hrms/__init__.py`), which depends on ERPNext 16.x and Frappe 16.x.

- **Repository**: https://github.com/frappe/hrms
- **Documentation**: https://docs.frappe.io/hrms

### Installation

```bash
bench get-app hrms
bench --site my-site install-app hrms
bench --site my-site migrate
```

---

## Module & Controller Map (source-verified)

HRMS ships two Python modules of DocTypes plus shared controllers/utilities. All paths below are relative to `apps/hrms/hrms/`.

| Area | Path | Key files |
|------|------|-----------|
| HR doctypes | `hr/doctype/` (~120 doctypes) | `leave_application/`, `leave_allocation/`, `leave_ledger_entry/`, `leave_type/`, `attendance/`, `shift_type/`, `shift_assignment/`, `employee_checkin/`, `expense_claim/`, `employee_onboarding/`, `employee_separation/`, `appraisal/`, `job_opening/`, `job_applicant/` |
| Payroll doctypes | `payroll/doctype/` (~43 doctypes) | `salary_slip/`, `salary_structure/`, `salary_structure_assignment/`, `payroll_entry/`, `salary_component/`, `salary_detail/`, `additional_salary/`, `payroll_period/`, `income_tax_slab/`, `salary_withholding/`, `gratuity/` |
| Shared controllers | `controllers/` | `employee_boarding_controller.py` (EmployeeBoardingController base for Onboarding/Separation), `employee_reminders.py` (birthday/anniversary schedulers) |
| HR utilities | `hr/utils.py` | leave earning/allocation, HRA exemption stubs, `validate_active_employee`, holiday helpers, bank-reconciliation matching |
| Payroll utilities | `payroll/utils.py`, `payroll/doctype/payroll_entry/payroll_entry.py` module functions | date helpers, employee queries |
| DocType class overrides | `overrides/` | `employee_master.EmployeeMaster`, `employee_timesheet.EmployeeTimesheet`, `employee_payment_entry.EmployeePaymentEntry`, `employee_project.EmployeeProject` |
| App wiring | `hooks.py` | `doc_events`, `scheduler_events`, `override_doctype_class`, `regional_overrides` |

**Important:** the **Employee** DocType itself is defined in **ERPNext** (`apps/erpnext/erpnext/setup/doctype/employee/employee.py`). HRMS does not redefine it; it *overrides the class* via `override_doctype_class` -> `hrms.overrides.employee_master.EmployeeMaster(Employee)` (`overrides/employee_master.py`). Company, Department, Designation, Branch, Employment Type, Holiday List, Salary Component/Structure accounting, and the whole Journal Entry / GL stack also come from ERPNext.


## Organization Structure

### Key DocTypes

| DocType | Purpose |
|---------|---------|
| Company | Legal entity, pay structure |
| Department | Organizational unit |
| Designation | Job title/position |
| Branch | Physical location |
| Employment Type | Full-time, Part-time, Contract |

### Setup

```python
# Create Department
dept = frappe.get_doc({
    "doctype": "Department",
    "department_name": "Engineering",
    "company": "My Company",
    "parent_department": "All Departments"
}).insert()

# Create Designation
desig = frappe.get_doc({
    "doctype": "Designation",
    "designation": "Software Engineer"
}).insert()
```

---

## Employee Management

### Employee DocType

```python
emp = frappe.new_doc("Employee")
emp.first_name = "John"
emp.last_name = "Doe"
emp.gender = "Male"
emp.date_of_birth = "1990-05-15"
emp.date_of_joining = frappe.utils.today()
emp.company = "My Company"
emp.department = "Engineering"
emp.designation = "Software Engineer"
emp.employment_type = "Full-time"
emp.status = "Active"
emp.insert()
```

### Key Employee Fields

| Field | Type | Description |
|-------|------|-------------|
| `employee_name` | Data | Auto-computed full name |
| `naming_series` | Select | HR-EMP-.YYYY.- |
| `status` | Select | Active, Inactive, Suspended, Left |
| `company` | Link | Associated company |
| `department` | Link | Department |
| `designation` | Link | Job title |
| `reports_to` | Link | Reporting manager (Employee) |
| `leave_policy` | Link | Leave Policy |
| `holiday_list` | Link | Holiday calendar |
| `attendance_device_id` | Data | Biometric device ID |

**Naming (v16):** ERPNext's `employee.json` declares `autoname: "naming_series:"`, but HRMS overrides it. `EmployeeMaster.autoname()` (`overrides/employee_master.py`) reads **HR Settings `emp_created_by`** and names the record by *Naming Series*, *Employee Number*, or *Full Name* accordingly — it throws if `emp_created_by` is unset. So the effective naming is controlled in **HR Settings**, not just the field default.

**Employee doc events (from `hooks.py doc_events["Employee"]`):** `validate` -> `validate_onboarding_process`; `on_update` -> `update_approver_role`, `publish_update`; `after_insert` -> `update_job_applicant_and_offer` (auto-accepts/submits linked Job Applicant + Job Offer); `on_trash` -> `update_employee_transfer`. `status` options are exactly `Active`, `Inactive`, `Suspended`, `Left`.

### Employee Lifecycle

```python
# Get active employees
active = frappe.get_all("Employee",
    filters={"status": "Active", "company": company},
    fields=["name", "employee_name", "department", "designation"]
)

# Check if employee exists
exists = frappe.db.exists("Employee", {"user_id": "john@example.com"})

# Get employee from user
emp_id = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
```

---

## Leave Management

### Key DocTypes

| DocType | Purpose |
|---------|---------|
| Leave Type | Define leave categories |
| Leave Policy | Assign leave types to groups |
| Leave Policy Assignment | Link policy to employee |
| Leave Allocation | Grant leave balance |
| Leave Application | Employee leave request |
| Leave Ledger Entry | Immutable balance ledger (source of truth) |

### Leave Type Setup

```python
lt = frappe.get_doc({
    "doctype": "Leave Type",
    "leave_type_name": "Annual Leave",
    "max_leaves_allowed": 21,
    "max_continuous_days_allowed": 14,
    "is_carry_forward": 1,
    "maximum_carry_forwarded_leaves": 5,
    "is_earned_leave": 0,
    "is_compensatory": 0,
    "is_ppl": 0,  # Partially Paid Leave
    "include_holiday": 0
}).insert()
```

### Leave Policy

```python
lp = frappe.new_doc("Leave Policy")
lp.leave_policy_name = "Standard Policy"
lp.append("leave_policy_details", {
    "leave_type": "Annual Leave",
    "annual_allocation": 21
})
lp.append("leave_policy_details", {
    "leave_type": "Sick Leave",
    "annual_allocation": 10
})
lp.insert()
```

### Leave Allocation

```python
la = frappe.new_doc("Leave Allocation")
la.employee = "HR-EMP-001"
la.leave_type = "Annual Leave"
la.from_date = "2024-01-01"
la.to_date = "2024-12-31"
la.new_leaves_allocated = 21
la.insert()
la.submit()
```

### Leave Application

```python
leave = frappe.new_doc("Leave Application")
leave.employee = "HR-EMP-001"
leave.leave_type = "Annual Leave"
leave.from_date = "2024-03-01"
leave.to_date = "2024-03-05"
leave.half_day = 0
leave.description = "Family vacation"
leave.leave_approver = "manager@example.com"
leave.insert()
leave.submit()
```

### Leave Balance Query

```python
from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on

balance = get_leave_balance_on(
    employee="HR-EMP-001",
    leave_type="Annual Leave",
    date=frappe.utils.today()
)
```

### Leave Ledger Entry (balance source of truth)

Leave balances are **not** a stored field — they are derived by summing **Leave Ledger Entry** rows. Both Leave Allocation (credit, positive `leaves`) and Leave Application (debit, negative `leaves`) create ledger entries on submit and delete them on cancel.

- `LeaveApplication.on_submit()` -> `create_leave_ledger_entry(submit=True)`; `on_cancel()` -> `create_leave_ledger_entry(submit=False)` (`hr/doctype/leave_application/leave_application.py:102,136,736`). When the application spans two allocation periods it splits into separate entries (`create_separate_ledger_entries`) or splits at carry-forward expiry (`create_ledger_entry_for_intermediate_allocation_expiry`).
- Actual row creation is `hr/doctype/leave_ledger_entry/leave_ledger_entry.py:create_leave_ledger_entry(ref_doc, args, submit)`. The doctype has an index on `("transaction_type", "transaction_name")` (`on_doctype_update`).
- `get_leave_balance_on(employee, leave_type, date, ...)` and `get_leave_allocation_records()` (`leave_application.py:978,1025`) compute balance from ledger rows; `get_leave_details(employee, date)` (`:939`) returns the per-type allocation/used/balance map used by the UI and salary slip.

**Leave Application key validations (`validate()` at `leave_application.py:76`):** `validate_active_employee`, `validate_balance_leaves` (raises `InsufficientLeaveBalanceError` unless the Leave Type has `allow_negative`), `validate_leave_overlap` (`OverlapError`), `validate_max_days` (`max_continuous_days_allowed`), `validate_block_days`, `validate_optional_leave`, `validate_applicable_after`. On submit, an **Approved** application also calls `update_attendance()` -> `create_or_update_attendance()` marking each day `On Leave` / `Half Day` (`:283,316`). Only status `Approved`/`Rejected` may be submitted (`:102`).

### Earned leave & scheduled leave processing

`hr/utils.py` drives leave accrual and expiry, wired via `scheduler_events` in `hooks.py`:

- `daily_long`: `allocate_earned_leaves()` (`hr/utils.py:357`) accrues monthly/quarterly/etc. earned leaves for Leave Types with `is_earned_leave=1`, using `get_monthly_earned_leave()` and the Earned Leave Schedule; `generate_leave_encashment()` drafts encashments on allocation expiry; and `hrms.hr.doctype.leave_ledger_entry.leave_ledger_entry.process_expired_allocation()` (`leave_ledger_entry.py:130`) writes expiry ledger entries for lapsed carry-forward / non-CF allocations.
- Rounding of accrued leaves respects the Leave Type `rounding` field (`round_earned_leaves`, `hr/utils.py:528`).

---

## Attendance Management

### Key DocTypes

| DocType | Purpose |
|---------|---------|
| Attendance | Daily attendance record |
| Shift Type | Work shift definition |
| Shift Assignment | Assign shift to employee |
| Employee Checkin | Biometric/manual checkin |

### Mark Attendance

```python
att = frappe.new_doc("Attendance")
att.employee = "HR-EMP-001"
att.attendance_date = frappe.utils.today()
att.status = "Present"  # Present, Absent, Half Day, On Leave, Work From Home
att.insert()
att.submit()
```

### Shift Setup

```python
shift = frappe.get_doc({
    "doctype": "Shift Type",
    "name": "Morning Shift",
    "start_time": "09:00:00",
    "end_time": "17:00:00",
    "enable_auto_attendance": 1,
    "determine_check_in_and_check_out": "Alternating entries",
    "working_hours_threshold_for_half_day": 4,
    "working_hours_threshold_for_absent": 2
}).insert()
```

### Shift Assignment

```python
sa = frappe.new_doc("Shift Assignment")
sa.employee = "HR-EMP-001"
sa.shift_type = "Morning Shift"
sa.start_date = "2024-01-01"
sa.end_date = "2024-12-31"
sa.insert()
```

### Employee Checkin

```python
ci = frappe.new_doc("Employee Checkin")
ci.employee = "HR-EMP-001"
ci.time = frappe.utils.now()
ci.device_id = "DEVICE-001"
ci.log_type = "IN"  # or "OUT"
ci.insert()
```

### Attendance Query

```python
from frappe.query_builder.functions import Count

# Monthly attendance summary
Attendance = frappe.qb.DocType("Attendance")
attendance = (
    frappe.qb.from_(Attendance)
    .select(Attendance.status, Count(Attendance.name).as_("count"))
    .where(Attendance.employee == "HR-EMP-001")
    .where(Attendance.attendance_date.between("2024-01-01", "2024-01-31"))
    .where(Attendance.docstatus == 1)
    .groupby(Attendance.status)
    .run(as_dict=True)
)
```

### Auto-attendance flow (source-verified)

When a Shift Type has `enable_auto_attendance=1`, attendance is generated from Employee Checkin logs by scheduled jobs (`hooks.py scheduler_events["hourly_long"]`):

1. `shift_type.update_last_sync_of_checkin()` advances each shift's `last_sync_of_checkin` (`hr/doctype/shift_type/shift_type.py:421`).
2. `shift_type.process_auto_attendance_for_all_shifts()` iterates every auto-attendance shift and calls `ShiftType.process_auto_attendance()` (`:111,455`).
3. `process_auto_attendance()` pulls unlinked check-ins (`get_employee_checkins`, `:199`), groups them per `(employee, shift_start)` in `_process()` (`:138`), computes status via `get_attendance()` using `working_hours_threshold_for_half_day` / `working_hours_threshold_for_absent` and `determine_check_in_and_check_out` (`:226`), then marks attendance and links the logs (`employee_checkin.mark_attendance_and_link_log`, `employee_checkin.py:200`). Missing days are back-filled `Absent` by `mark_absent_for_dates_with_no_attendance()` (`:262`).

Working hours are derived by `employee_checkin.calculate_working_hours(logs, check_in_out_type, working_hours_calc_type)` (`employee_checkin.py:367`). Attendance `validate()` blocks duplicates (`DuplicateAttendanceError`) and overlapping-shift records (`OverlappingShiftAttendanceError`) and cross-checks Leave Applications (`attendance.py:44,70,116,157`). The whitelisted `mark_attendance(employee, attendance_date, status, shift=None, leave_type=None, late_entry=False, early_exit=False, half_day_status=None)` helper inserts+submits in one call within a savepoint (`attendance.py:307`).

---

## Payroll, Recruitment, Performance & Expenses

Split out to keep this file under the reference size cap: see
[hrms-payroll-and-talent.md](hrms-payroll-and-talent.md) for Salary
Component/Structure/Assignment, Payroll Entry (bulk processing, the
`SalarySlip.validate()`/`calculate_net_pay()` computation flow, and the
ERPNext Journal Entry/GL integration), Recruitment (Job Opening/Applicant/
Offer), Performance (Appraisal), and Expense Claims.

---

## Employee Lifecycle

### Transfer

```python
transfer = frappe.new_doc("Employee Transfer")
transfer.employee = "HR-EMP-001"
transfer.new_company = company
transfer.append("transfer_details", {
    "property": "Department",
    "current": "Engineering",
    "new": "Product"
})
transfer.insert()
transfer.submit()
```

### Promotion

```python
promo = frappe.new_doc("Employee Promotion")
promo.employee = "HR-EMP-001"
promo.promotion_date = frappe.utils.today()
promo.append("promotion_details", {
    "property": "Designation",
    "current": "Software Engineer",
    "new": "Senior Software Engineer"
})
promo.insert()
promo.submit()
```

### Separation

```python
sep = frappe.new_doc("Employee Separation")
sep.employee = "HR-EMP-001"
sep.boarding_status = "In Process"
sep.resignation_letter_date = frappe.utils.today()
sep.insert()
```

### Onboarding / Separation boarding controller (source-verified)

**Employee Onboarding** and **Employee Separation** both subclass `EmployeeBoardingController` (`controllers/employee_boarding_controller.py:14`). On `on_submit()` (`:26`) the controller creates a **Project** for the boarding process and one **Task** per `Employee Boarding Activity` row (`create_task_and_notify_user`, `:51`), assigning each task to the responsible user/role and scheduling `begin_on`/`duration` around the employee's Holiday List (`get_task_dates`, `update_if_holiday`). `on_cancel()` (`:143`) deletes the project and its tasks.

Task/Project completion feeds the boarding status back: `hooks.py doc_events` wires `Task.on_update` and `Project.validate` to `update_task` / `update_employee_boarding_status` (`:177,196`), which recomputes `boarding_status` from task progress. Creating the actual Employee from an Onboarding is validated by `validate_onboarding_process` (`overrides/employee_master.py:29`).

---

## Training

```python
# Training Event
te = frappe.new_doc("Training Event")
te.event_name = "Python Workshop"
te.type = "Seminar"
te.start_time = "2024-03-01 09:00:00"
te.end_time = "2024-03-01 17:00:00"
te.append("employees", {"employee": "HR-EMP-001"})
te.insert()

# Training Result
tr = frappe.new_doc("Training Result")
tr.training_event = te.name
tr.append("employees", {
    "employee": "HR-EMP-001",
    "grade": "A",
    "hours": 8
})
tr.insert()
tr.submit()
```

---

## API Patterns for HRMS

### Common Queries

```python
from frappe.query_builder.functions import Count

# Get employee hierarchy
def get_reporting_chain(employee):
    chain = []
    current = employee
    while current:
        reports_to = frappe.db.get_value("Employee", current, "reports_to")
        if reports_to:
            chain.append(reports_to)
            current = reports_to
        else:
            break
    return chain

# Get department headcount
def get_department_stats(department):
    Employee = frappe.qb.DocType("Employee")
    return (
        frappe.qb.from_(Employee)
        .select(Employee.designation, Count(Employee.name).as_("count"))
        .where(Employee.department == department)
        .where(Employee.status == "Active")
        .groupby(Employee.designation)
        .run(as_dict=True)
    )

# Get leave summary
def get_leave_summary(employee, year):
    allocations = frappe.get_all("Leave Allocation",
        filters={
            "employee": employee,
            "docstatus": 1,
            "from_date": [">=", f"{year}-01-01"]
        },
        fields=["leave_type", "total_leaves_allocated", "total_leaves_encashed"]
    )
    return allocations
```

---
## Integration & App Wiring (`hooks.py`, source-verified)

Key `hooks.py` declarations that shape how HRMS integrates with Frappe/ERPNext:

- `required_apps = ["frappe/erpnext"]`; `app_home = "/desk/people"`; SPA bundle via `app_include_js/css = "hrms.bundle.*"`.
- `override_doctype_class`: `Employee`→`EmployeeMaster`, `Timesheet`→`EmployeeTimesheet`, `Payment Entry`→`EmployeePaymentEntry`, `Project`→`EmployeeProject`.
- `doc_events` bridge ERPNext docs into HR logic — e.g. `Journal Entry.on_submit/on_cancel` update Expense Claim, Full & Final Statement, and Salary Withholding payment status; `Payment Entry` events reconcile Expense Claims; `Loan.validate` → `validate_loan_repay_from_salary`; `Company.on_update` → `make_company_fixtures` / `set_default_hr_accounts`.
- `scheduler_events`: `hourly_long` runs auto-attendance + check-in sync + shift-schedule creation; `daily_long` runs earned-leave allocation, leave encashment, and expired-allocation processing; `daily` sends interview/birthday/anniversary reminders and closes expired job openings.
- `regional_overrides["India"]` swaps in `hrms.regional.india.utils` for HRA exemption and marginal-relief tax (the base functions in `hr/utils.py:715-732` are deliberate no-op stubs decorated with `@erpnext.allow_regional`).
- Accounting integration flags: `period_closing_doctypes = ["Payroll Entry"]`, `invoice_doctypes = ["Expense Claim"]`, `bank_reconciliation_doctypes = ["Expense Claim"]`, `advance_payment_payable_doctypes = ["Leave Encashment", "Gratuity", "Employee Advance"]`, plus `accounting_dimension_doctypes` for payroll.

---


## Best Practices

1. **Set up Holiday List** before processing attendance or leave
2. **Use Leave Policy Assignments** for bulk leave allocation
3. **Configure Salary Components** with formulas for consistency
4. **Use Payroll Entry** for bulk processing, not individual slips
5. **Track Employee lifecycle** through Transfer/Promotion/Separation DocTypes
6. **Set up Shift Types** before enabling auto-attendance
7. **Use Appraisal Templates** for standardized reviews
8. **Configure leave approvers** in Employee records
9. **Always run `bench --site <site> migrate`** after HRMS updates

---

## Sources

Verified against HRMS 16.4.1 (`apps/hrms/hrms/__init__.py`) and ERPNext/Frappe 16.x. Paths relative to `apps/hrms/hrms/` unless noted:

- `__init__.py` (version), `hooks.py` (app wiring, doc_events, scheduler_events, override_doctype_class, regional_overrides, accounting flags)
- `overrides/employee_master.py` (`EmployeeMaster(Employee)`, autoname via HR Settings, employee doc-event handlers)
- `apps/erpnext/erpnext/setup/doctype/employee/employee.py` + `employee.json` (Employee DocType, status options, `autoname: naming_series:`)
- `hr/doctype/leave_application/leave_application.py` (`validate`, `on_submit`, `create_leave_ledger_entry`, `update_attendance`, `get_leave_balance_on`, `get_leave_details`, `get_leave_allocation_records`)
- `hr/doctype/leave_ledger_entry/leave_ledger_entry.py` (`create_leave_ledger_entry`, `process_expired_allocation`, `expire_allocation`)
- `hr/utils.py` (`allocate_earned_leaves`, `generate_leave_encashment`, `get_monthly_earned_leave`, `validate_active_employee`, `get_matching_queries`, regional HRA/tax stubs)
- `hr/doctype/attendance/attendance.py` (`validate`, `mark_attendance`, `mark_bulk_attendance`, duplicate/overlap checks)
- `hr/doctype/shift_type/shift_type.py` (`process_auto_attendance`, `process_auto_attendance_for_all_shifts`, `update_last_sync_of_checkin`, `get_attendance`)
- `hr/doctype/shift_assignment/shift_assignment.json` (`shift_type` field), `hr/doctype/employee_checkin/employee_checkin.py` (`mark_attendance_and_link_log`, `calculate_working_hours`)
- `controllers/employee_boarding_controller.py` (`EmployeeBoardingController`, `update_employee_boarding_status`, `update_task`)
- Query builder: `apps/frappe/frappe/query_builder/functions.py:4` (re-exports `pypika.functions.Count`), `env/lib/python3.14/site-packages/pypika/terms.py:192` (`Field.between`)
