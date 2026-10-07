# Frappe HRMS: Payroll, Recruitment, Performance & Expenses

Payroll processing, recruitment, performance appraisal, and expense claims,
split out of [hrms-patterns.md](hrms-patterns.md) (Organization, Employee,
Leave, and Attendance). Verified against **HRMS 16.4.1** (`hrms/__init__.py`),
which depends on ERPNext 16.x and Frappe 16.x. Paths below are relative to
`apps/hrms/hrms/` unless noted.

## Payroll Management

### Key DocTypes

| DocType | Purpose |
|---------|---------|
| Salary Component | Earnings/deductions |
| Salary Structure | Pay template |
| Salary Structure Assignment | Link structure to employee |
| Payroll Entry | Bulk salary processing |
| Salary Slip | Individual pay slip |

### Salary Component

```python
# Earning
earning = frappe.get_doc({
    "doctype": "Salary Component",
    "salary_component": "Basic Salary",
    "salary_component_abbr": "BS",
    "type": "Earning",
    "is_tax_applicable": 1
}).insert()

# Deduction
deduction = frappe.get_doc({
    "doctype": "Salary Component",
    "salary_component": "Health Insurance",
    "salary_component_abbr": "HI",
    "type": "Deduction",
    "is_tax_applicable": 0
}).insert()
```

### Salary Structure

```python
ss = frappe.new_doc("Salary Structure")
ss.name = "Standard Structure"
ss.company = company
ss.payroll_frequency = "Monthly"
ss.append("earnings", {
    "salary_component": "Basic Salary",
    "formula": "base * 0.4",
    "amount_based_on_formula": 1
})
ss.append("earnings", {
    "salary_component": "House Allowance",
    "formula": "base * 0.3",
    "amount_based_on_formula": 1
})
ss.append("deductions", {
    "salary_component": "Health Insurance",
    "amount": 2000,
    "amount_based_on_formula": 0
})
ss.insert()
ss.submit()
```

### Salary Structure Assignment

```python
ssa = frappe.new_doc("Salary Structure Assignment")
ssa.employee = "HR-EMP-001"
ssa.salary_structure = "Standard Structure"
ssa.from_date = "2024-01-01"
ssa.base = 100000  # Base salary
ssa.insert()
ssa.submit()
```

### Payroll Entry (Bulk Processing)

```python
pe = frappe.new_doc("Payroll Entry")
pe.company = company
pe.posting_date = frappe.utils.today()
pe.payroll_frequency = "Monthly"
pe.start_date = "2024-01-01"
pe.end_date = "2024-01-31"
pe.department = "Engineering"  # Optional filter
pe.insert()

# Get employees
pe.fill_employee_details()

# Create salary slips
pe.create_salary_slips()

# Submit salary slips
pe.submit_salary_slips()

# Create bank entry (optional)
pe.make_bank_entry()
```

### Salary Slip Query

```python
slips = frappe.get_all("Salary Slip",
    filters={
        "employee": "HR-EMP-001",
        "docstatus": 1,
        "posting_date": ["between", ["2024-01-01", "2024-12-31"]]
    },
    fields=["name", "posting_date", "gross_pay", "total_deduction", "net_pay"]
)
```

### Payroll Entry lifecycle (v16, source-verified)

`payroll/doctype/payroll_entry/payroll_entry.py`:

- `fill_employee_details()` (whitelisted, `:218`) populates the `employees` child table via `get_employee_list()` filtered by company/branch/department/designation/grade and `payroll_frequency`, excluding already-payrolled employees.
- **`on_submit()` (`:74`) calls `create_salary_slips()` automatically** — in v16 you no longer need a separate manual `create_salary_slips()` step after submit (the snippet above is the pre-submit draft flow). `before_submit()` (`:68`) runs `validate_existing_salary_slips`, `validate_payroll_payable_account`, and optional unmarked-attendance validation.
- `create_salary_slips()` (whitelisted, `:258`) enqueues `create_salary_slips_for_employees()` (`:1544`) which builds one Salary Slip per employee.
- `submit_salary_slips()` (whitelisted, `:321`) enqueues `submit_salary_slips_for_employees()` (`:1626`); after all slips submit it calls **`make_accrual_jv_entry()`** and emails slips (`:1651`).
- `make_bank_entry(for_withheld_salaries=False)` (whitelisted, `:910`) creates the payment Journal Entry against the payment account.

### Salary Slip computation flow (payroll computation entry points)

`SalarySlip` (`payroll/doctype/salary_slip/salary_slip.py`) extends `erpnext...TransactionBase`. Computation is driven from **`validate()` (`:149`)** — this is the top-level entry point every save runs:

```
SalarySlip.validate()                                   # :149
 ├─ get_emp_and_working_day_details()  (first load)     # :354  pulls structure + working days
 │    └─ pull_sal_struct() -> salary_structure.make_salary_slip()   # :445 / salary_structure.py:334
 ├─ get_working_days_details(lwp=...)                   # :459  payment_days, LWP/PPL, absents
 ├─ set_salary_structure_assignment()                  # :820  loads the active SSA (base/variable)
 ├─ calculate_net_pay()                                 # :844  ◄── core money computation
 ├─ compute_year_to_date() / compute_month_to_date()   # :2280 / :2304
 └─ add_leave_balances()                                # :2364
```

**`calculate_net_pay()` (`:844`) is the core entry point** and runs, in order:

1. `get_period_factor(...)` -> remaining sub-periods (for annualized tax) when a Payroll Period exists.
2. `calculate_component_amounts("earnings")` (`:1161`) -> `add_structure_components` + `add_additional_salary_components` + `add_employee_benefits`. Each row is evaluated by `eval_condition_and_formula()` (`:1292`) using a sandboxed `_safe_eval` (`:2661`) over `get_data_for_eval()` data (employee fields, `base`, component abbreviations).
3. `set_gross_pay_and_base_gross_pay()` -> `gross_pay` = `get_component_totals("earnings", depends_on_payment_days=1)`.
4. `calculate_component_amounts("deductions")` -> structure deductions + additional salary + **`add_tax_components()`** (`:1579`). Income tax is computed by `calculate_variable_based_on_taxable_salary` -> `calculate_variable_tax` -> `calculate_tax_by_tax_slab` (`:1798,1809,2474`) against the assignment's Income Tax Slab; annualized taxable earnings come from `compute_taxable_earnings_for_year` / `get_taxable_earnings` (`:895,1960`).
5. `set_loan_repayment(self)` (loan deduction, if the Lending app is present).
6. `set_precision_for_component_amounts()` then `set_net_pay()` (`:878`): `total_deduction = get_component_totals("deductions")`; `net_pay = gross_pay − total_deduction` (payment-day adjusted).
7. `compute_income_tax_breakup()` (`:968`) for the tax breakup section.

Payment-day proration: `get_working_days_details()` (`:459`) computes `total_working_days`, `payment_days`, and LWP from either **Leave Application** (`calculate_lwp_or_ppl_based_on_leave_application`, `:672`) or **Attendance** (`calculate_lwp_ppl_and_absent_days_based_on_attendance`, `:746`) depending on Payroll Settings; components with `depends_on_payment_days` are scaled by `get_amount_based_on_payment_days()` (`:2051`).

Whitelisted recompute helpers used by the form: `process_salary_based_on_working_days()` (`:2230`), `set_totals()` (`:2235`), `get_emp_and_working_day_details()` (`:354`).

### Payroll GL / ERPNext accounting integration

HRMS does **not** write GL Entries directly — it creates ERPNext **Journal Entries**, and ERPNext posts the GL:

- **Accrual JE:** after slips submit, `make_accrual_jv_entry(submitted_salary_slips)` (`payroll_entry.py:556`) totals earnings/deductions per Salary Component using **Salary Component Account** (`get_salary_component_account`, `:347`) to map component→GL account, builds JE accounts (`get_payable_amount_for_earnings_and_deductions`, `set_payable_amount_against_payroll_payable_account`), and calls `make_journal_entry(voucher_type="Journal Entry", submit_journal_entry=True)` (`:635`). It debits earning/expense accounts, credits deduction accounts, and nets to the **Payroll Payable Account**; the JE name is stored back on each slip (`set_journal_entry_in_salary_slips`, `:1103`). With Payroll Settings `process_payroll_accounting_entry_based_on_employee` enabled, per-employee accounting dimensions carry through to the JE.
- **Bank/payment JE:** `make_bank_entry()` (`:910`) -> `set_accounting_entries_for_bank_entry()` (`:1012`) creates the payment JE debiting Payroll Payable and crediting the bank/payment account.
- On cancel, `PayrollEntry.on_cancel()` (`:123`) exempts `("GL Entry", "Salary Slip", "Journal Entry")` from auto-cancel and cancels linked slips/JEs itself. `Journal Entry` doc events in `hooks.py` (`:190`) keep expense-claim, F&F, and salary-withholding statuses in sync, and `unlink_ref_doc_from_salary_slip` clears the JE link on cancel.
- `hooks.py` marks `period_closing_doctypes = ["Payroll Entry"]` and adds payroll accounting dimensions, integrating payroll into ERPNext period-closing and accounting-dimension flows.

## Recruitment

### Key DocTypes

| DocType | Purpose |
|---------|---------|
| Job Opening | Published positions |
| Job Applicant | Candidate records |
| Job Applicant Source | Recruitment channel |
| Job Offer | Formal offer letter |
| Staffing Plan | Headcount planning |

### Job Opening

```python
jo = frappe.new_doc("Job Opening")
jo.job_title = "Senior Developer"
jo.designation = "Software Engineer"
jo.department = "Engineering"
jo.company = company
jo.description = "Looking for experienced developer..."
jo.status = "Open"
jo.insert()
```

### Job Applicant

```python
ja = frappe.new_doc("Job Applicant")
ja.applicant_name = "Jane Smith"
ja.email_id = "jane@example.com"
ja.job_title = "Senior Developer"
ja.source = "Website"
ja.status = "Open"  # Open, Replied, Accepted, Rejected, Hold
ja.insert()
```

### Job Offer

```python
from hrms.hr.doctype.job_applicant.job_applicant import make_offer_letter

offer = make_offer_letter("JA-001")
offer.offer_date = frappe.utils.today()
offer.designation = "Software Engineer"
offer.insert()
```

## Performance Management

### Appraisal

```python
appraisal = frappe.new_doc("Appraisal")
appraisal.employee = "HR-EMP-001"
appraisal.appraisal_template = "Standard Review"
appraisal.start_date = "2024-01-01"
appraisal.end_date = "2024-06-30"
appraisal.append("goals", {
    "kra": "Code Quality",
    "per_weightage": 30,
    "score": 4
})
appraisal.append("goals", {
    "kra": "Project Delivery",
    "per_weightage": 40,
    "score": 5
})
appraisal.insert()
appraisal.submit()
```

## Expense & Travel Claims

### Expense Claim

```python
ec = frappe.new_doc("Expense Claim")
ec.employee = "HR-EMP-001"
ec.expense_approver = "manager@example.com"
ec.append("expenses", {
    "expense_type": "Travel",
    "expense_date": frappe.utils.today(),
    "amount": 5000,
    "description": "Client meeting travel"
})
ec.insert()
ec.submit()
```

## Sources

Verified against HRMS 16.4.1 (`apps/hrms/hrms/__init__.py`) and ERPNext/Frappe 16.x. Paths relative to `apps/hrms/hrms/` unless noted:

- `payroll/doctype/salary_slip/salary_slip.py` (`validate`, `calculate_net_pay`, `calculate_component_amounts`, `add_tax_components`, `get_working_days_details`, `_safe_eval`, tax methods)
- `payroll/doctype/payroll_entry/payroll_entry.py` (`on_submit`, `create_salary_slips`, `submit_salary_slips`, `make_accrual_jv_entry`, `make_journal_entry`, `make_bank_entry`, GL/JE mapping) + `payroll_entry.js`
- `payroll/doctype/salary_structure/salary_structure.py` (`make_salary_slip`, `assign_salary_structure`, `create_salary_structure_assignment`)
- `hooks.py` (`period_closing_doctypes`, Journal Entry doc events, accounting dimensions)
</content>
