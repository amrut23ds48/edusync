# PROJECT_SPEC.md

## CAGS Automation Web Application --- Prototype Specification

**Document purpose:** Define the prototype's product scope, roles, core
workflows, architecture constraints, data ownership, and acceptance
criteria for implementation by Antigravity.

**Status:** Implementation specification for the prototype\
**Source workbook:** `cags-theory.xlsx`\
**Outcome reference:** `project-outcome.pdf`

------------------------------------------------------------------------

## 1. Project objective

Build a role-based web application that reduces repetitive
administrative work involved in preparing and maintaining CAGS theory
records. The application must provide a clear dashboard for super admins
and teachers, preserve separation between academic contexts and assigned
users, support student-list Excel imports, assist with CO--PO mapping
using the OpenAI API, and connect timetable-driven attendance with
teaching-plan and monthly-report data.

This is a **prototype**, not a complete replacement for every sheet in
the source workbook. Implement only the first six tabs in the workbook,
through the CO-4-related mapping and action-plan workflow. Do not
implement the remaining tabs unless explicitly requested later.

## 2. Source-of-truth files and scope interpretation

Use the provided files as the source of truth for names and academic
terminology:

-   `cags-theory.xlsx`
-   `project-outcome.pdf`

The workbook's first six tabs, in workbook order, are:

1.  `Dashboard`
2.  `List of Students`
3.  `CO-PO Mapping`
4.  `Mapping Calculation`
5.  `COA-04`
6.  `COs Action Plan`

The workbook contains additional tabs, including `Working Days Calc`,
`Teaching Plan`, assessment tabs, and attainment tabs. They are
**outside the six-tab spreadsheet scope** for this prototype. However,
the requested timetable, attendance, teaching-plan assistance, and
monthly-report features remain required as application workflows. They
should be implemented as focused application features and should not be
represented as fully implemented additional spreadsheet tabs.

### 2.1 Prototype data boundary

-   Support Course Outcomes (COs) through **CO-4** for the prototype.
-   Store and display the applicable Program Outcomes (POs), Program
    Specific Outcomes (PSOs), and other project-outcome definitions
    supplied by the institution.
-   Use the supplied outcome PDF for the PO, PEO, and PSO text. Do not
    invent official outcome wording.
-   Do not hardcode example course names, teacher names, student lists,
    or academic years from the workbook as production defaults.
-   Treat the workbook's existing formulas and example values as
    reference material. Recreate the relevant business meaning in
    application logic rather than assuming that importing the workbook's
    entire formula layout is required.
-   If a formula, mapping-strength rule, threshold, or calculation
    cannot be confidently derived from the supplied files, mark it as
    configurable or request confirmation. Do not silently invent an
    official academic rule.

## 3. Users and roles

The prototype has two application roles:

### 3.1 Super Admin

The super admin manages the institution-level configuration and has
authorized access across the application.

Responsibilities:

-   Create teacher login accounts and assign or reset access through a
    secure administrative flow.
-   View, update, deactivate, and reassign teacher accounts.
-   Create and maintain academic years, working-year ranges, year/class
    groups, semesters, and class records.
-   Create and update subjects/courses and assign them to teachers and
    academic contexts.
-   Change a teacher's subject or class assignment without exposing
    unrelated data to that teacher.
-   Create, view, update, and delete the institution's CO, PO, PSO, and
    project-outcome definitions as allowed by the final academic policy.
-   Configure class timetables.
-   View and administer student records, attendance, CAGS records, and
    reports across authorized academic contexts.
-   Review AI-generated suggestions and institution-level records where
    needed.

### 3.2 Teacher

A teacher sees and manages only the records permitted by their
assignments.

Responsibilities:

-   Sign in using credentials provisioned through the admin workflow.
-   View their assigned academic years, year/class groups, semesters,
    and subjects.
-   Open a specific academic context and course.
-   Import and validate the student list for that context.
-   View and select the applicable course outcomes and project/program
    outcomes.
-   Generate AI-assisted CO--PO mapping suggestions, review them, and
    save approved mappings.
-   Manage permitted student records, attendance, CAGS entries, and
    teaching-plan records for assigned classes/courses.
-   View and generate monthly reports only for assigned contexts.
-   Correct or delete records they are authorized to manage, with
    appropriate audit/history behaviour for consequential changes.

Teachers must not be able to edit global outcome definitions, manage
other teachers, change assignments, or access unassigned classes by
changing a URL or client-side state.

## 4. Core academic hierarchy and segregation

Represent the academic hierarchy explicitly. At minimum, the system must
distinguish:

-   Institution/department scope
-   Working academic year or year range (for example, `2024-2026`,
    stored as a value rather than inferred from a class label)
-   Academic year/class year (for example, First Year, Second Year,
    Final Year)
-   Semester
-   Class/division or cohort, where applicable
-   Subject/course
-   Assigned teacher
-   Student roster
-   Course-specific CAGS records

Do not collapse these into one ambiguous text field. Use stable document
IDs and explicit relationships. Display labels can be human-readable,
but permissions and joins must use IDs.

A teacher's access should be derived from server-verified assignment
data. Every class-scoped record must carry enough identifiers to check
its academic context and ownership consistently, such as
`academicYearId`, `semesterId`, `classId`, and, where relevant,
`subjectId` and `teacherUid`.

The UI should make the current context visible (academic year,
class/year, semester, and subject) and should not silently carry records
from one context into another.

## 5. Required application workflows

### 5.1 Authentication and initial routing

1.  A user signs in through Firebase Authentication.
2.  The application retrieves the user's application profile and role
    from Firestore.
3.  The application routes the user to the correct dashboard.
4.  If the profile is missing, disabled, or has an unsupported role,
    deny application access and show a useful recovery message.
5.  The UI may hide unavailable actions, but all access must also be
    enforced by Firestore Security Rules and secure server-side
    endpoints.

The initial implementation should include a documented, safe bootstrap
process for creating the first super admin. Do not make public sign-up
capable of assigning the super-admin role.

### 5.2 Super-admin configuration

The super admin must be able to create, read, update, and
delete/deactivate supported records through intuitive management
screens:

-   Teacher profiles and access status
-   Academic years and working-year ranges
-   Year/class groups and semesters
-   Classes/cohorts and divisions, where applicable
-   Subjects/courses
-   Teacher-to-class/course assignments
-   CO, PO, PSO, and project-outcome definitions
-   Timetable entries

Before deleting a record referenced by historical data, the application
should warn the admin and prevent orphaning or accidental loss of
records. Prefer deactivation/archive for records that are already
referenced by attendance or CAGS history.

### 5.3 Teacher course selection

The teacher dashboard should show assigned contexts only. A typical
navigation path is:

`Academic/Working Year → Year/Class → Semester → Subject/Course`

The actual hierarchy may include a division/cohort level if the
institution uses it. A teacher must be able to switch among assigned
contexts without mixing student rosters or records.

### 5.4 Student Excel import

1.  The teacher chooses an authorized academic context and course/class.
2.  The teacher uploads an Excel file in the documented import format.
3.  The frontend parses the file locally and displays a preview before
    saving.
4.  Validate required columns, blank values, duplicate roll
    numbers/student identifiers, invalid row values, and duplicate
    students already stored in the selected context.
5.  Show row-specific validation errors and allow the teacher to correct
    the file and retry.
6.  Require an explicit confirmation before writing imported data to
    Firestore.
7.  Show a summary of created, updated, skipped, and rejected rows.
8.  Re-importing the same file must not create duplicate students. The
    chosen upsert/duplicate policy must be documented and consistently
    applied.

The application should not require Firebase Storage for this prototype.
Parse the selected workbook in the browser, save only validated
structured records to Firestore, and discard the local file when the
import flow finishes unless the user explicitly downloads it again. Do
not claim that the source file has been archived.

The exact required Excel headers and any template-specific columns must
be documented in the dedicated Excel/CAGS specification after inspecting
the workbook structure. Do not guess headers from the first few visible
rows, because the sheet includes metadata and formatted template rows.

### 5.5 CO--PO mapping workflow

1.  The teacher opens a permitted course.
2.  The application loads the course's COs through CO-4 and the
    institution's approved PO/PSO definitions.
3.  The teacher requests an AI-assisted mapping.
4.  The OpenAI-backed endpoint receives only the required course/outcome
    text and relevant instructions; it must not receive unnecessary
    student personal information.
5.  The model returns structured mapping suggestions in a defined JSON
    schema, including the CO identifier, suggested PO/PSO identifiers,
    rationale, and any uncertainty.
6.  Validate that every returned CO and PO/PSO identifier exists in the
    request's allowed set. Reject malformed or invented IDs.
7.  Present the suggestions in an editable review interface.
8.  The teacher accepts, edits, or rejects the suggestions.
9.  Save only the reviewed/approved mapping as official application
    data. Keep AI suggestions distinguishable from approved mappings.
10. Store who approved or changed the mapping and when.

AI is an assistant, not the final academic authority. Do not
automatically treat a model response as an approved institutional
mapping.

The exact numerical mapping-strength and percentage rules shown in the
workbook must be confirmed from the workbook's formulas and
institutional policy before implementation. Do not assume a generic
formula.

### 5.6 CAGS views for the first six tabs

Provide application views corresponding to the following workbook tabs:

-   **Dashboard:** course and academic-context summary, key completion
    indicators, mapping status, and relevant report summaries.
-   **List of Students:** roster for the selected class/context, with
    controlled create/read/update/delete operations.
-   **CO-PO Mapping:** editable/reviewable course articulation matrix
    using approved outcomes.
-   **Mapping Calculation:** display the applicable mapping inputs and
    calculations only after their formulas/rules have been verified.
-   **COA-04:** implement the relevant CO target-level settings
    represented by this sheet, using verified fields and calculation
    rules.
-   **COs Action Plan:** store and manage the action plan for COs
    through CO-4, with explicit teacher ownership and context.

These are application screens informed by the workbook, not a promise of
pixel-perfect Excel reproduction. Preserve the workbook's academic
terminology and meaning. If any field or calculation cannot be
identified reliably, document the uncertainty instead of fabricating
behaviour.

### 5.7 Timetable and attendance

The super admin can create, view, update, and delete timetable entries
for a class/context. A timetable entry should identify the class,
subject, assigned teacher, day/date or recurrence rule, start time, end
time, and relevant academic context.

Teachers should see only their assigned timetable entries. For a
scheduled lecture, the teacher can open the class roster and record
attendance. The application must:

-   Prevent duplicate attendance sessions for the same scheduled lecture
    unless an authorized correction workflow is used.
-   Record attendance against a specific class, subject, date/session,
    and roster.
-   Support correction of attendance by authorized users.
-   Record the editor and timestamp for consequential changes.
-   Define how cancelled, rescheduled, or extra lectures are
    represented.
-   Update attendance summaries and the relevant monthly report from the
    saved attendance records.
-   Use saved records as the source of truth; do not rely on a UI-only
    count.

The detailed attendance schema, recurrence handling, and report
calculations belong in the dedicated attendance/reporting document.

### 5.8 Teaching-plan assistance and monthly reports

The application must provide the requested teaching-plan assistance
based on the timetable and lecture records. AI may suggest an
ICT/tool/activity entry from teacher-provided topic and lecture context,
but the teacher must review and save the final entry. Attendance alone
must not be used to infer that a topic was taught or that a specific ICT
tool was used.

Monthly reports should be generated from stored records for a selected
month and authorized academic context. They should clearly distinguish:

-   Scheduled lectures
-   Recorded/completed lecture sessions
-   Attendance totals and percentages, using an explicitly defined
    denominator
-   Teaching-plan entries and completion status
-   CO--PO mapping/action-plan status where applicable

Do not fabricate report values when source records are missing. Show
"not recorded" or "incomplete" where appropriate. Keep calculations
consistent between the dashboard and any exported report.

## 6. CRUD and data-lifecycle requirements

CRUD means the application must support actual persisted operations, not
just UI buttons.

-   **Create:** validate the input and save a correctly scoped record.
-   **Read:** retrieve only records the current user is authorized to
    view.
-   **Update:** validate changes, preserve relationships, and update
    audit metadata.
-   **Delete:** require confirmation for destructive actions and check
    dependent records. Use deactivation/archive when history must be
    preserved.

Both roles need genuine CRUD for the resources they are permitted to
manage. Super admins have institution-wide administrative CRUD. Teachers
have CRUD only for permitted records in their assigned contexts. Global
definitions and assignments remain admin-controlled.

Every CRUD screen must include loading, success, empty,
validation-error, permission-denied, and database-error states. A failed
write must not show a false success message.

## 7. Technical architecture and non-negotiable constraints

### 7.1 Stack

-   React for the frontend.
-   Firebase Authentication for sign-in.
-   Cloud Firestore for application data.
-   Vercel for frontend hosting and serverless API routes.
-   OpenAI API accessed only through a Vercel server-side endpoint.
-   A browser-compatible Excel parsing library for local import preview
    and validation.
-   Firebase Storage is not required for the prototype.
-   Firebase Cloud Functions must not be used.

### 7.2 Secure AI request path

`React UI → Vercel API route → verify Firebase ID token → validate request and permissions → OpenAI API → validate model output → return result to UI`

The OpenAI API key must exist only in Vercel server-side environment
variables. Never prefix it with a public frontend variable name or
bundle it into React. The API route must authenticate the caller, verify
authorization, validate request size and shape, and constrain the
model's output. Apply sensible rate/usage limits to prevent accidental
cost spikes.

### 7.3 Firestore security

Use Firestore Security Rules to enforce user identity, role, record
scope, and permitted operations. Do not treat client-side route guards
as authorization. Do not allow a user to grant themselves the
super-admin role by editing their profile. Use a trusted bootstrap/admin
process to establish privileged roles.

Because Vercel serverless routes may use a privileged Firebase Admin
SDK, those routes must explicitly verify Firebase ID tokens and enforce
application authorization. Admin SDK operations bypass Firestore
Security Rules, so server-side authorization checks are mandatory.

### 7.4 Maintainable implementation

-   Use reusable components and shared validation functions.
-   Separate UI, Firestore access, schema validation, and AI API calls.
-   Keep stable IDs for entities; do not use display names as document
    IDs.
-   Avoid duplicating calculated totals as independent sources of truth
    unless there is a documented reason.
-   Use server timestamps for audit fields where possible.
-   Use transactions or batched writes for operations that must remain
    consistent.
-   Make long-running or multi-step imports recoverable and report
    partial failures clearly.
-   Keep test/demo data separate from real institutional records.
-   Do not commit secrets to source control.

## 8. UX requirements

The interface should be intuitive for teachers who are not expected to
understand database terminology.

-   Use a persistent, clear navigation structure appropriate to each
    role.
-   Show the current academic context in page headings or breadcrumbs.
-   Provide searchable/filterable tables for students, courses,
    outcomes, and records where useful.
-   Use clear labels and inline validation rather than exposing raw
    Firestore errors.
-   Make AI-generated suggestions visibly different from approved
    records.
-   Provide confirmation for destructive actions and clear recovery
    paths for failed imports.
-   Ensure layouts work on common laptop and tablet widths; core
    attendance screens should remain usable on mobile.
-   Avoid presenting empty or unconfigured features as if they are
    complete.

## 9. Explicitly out of scope

Unless separately approved, do not implement:

-   The remaining workbook tabs beyond the first six.
-   Full automation of every CAGS theory or practical sheet.
-   Firebase Cloud Functions.
-   Firebase Storage-based file archiving.
-   A public sign-up flow that lets users select their own role.
-   Automatic final approval of AI-generated mappings.
-   Unverified academic formulas, outcome definitions, or mapping
    thresholds.
-   Advanced analytics or institution-wide integrations not required for
    the prototype.
-   Any assumption that a lecture's attendance proves the teaching-plan
    content was completed.

## 10. Definition of done and acceptance criteria

The prototype is acceptable only when the following can be demonstrated
in a test environment.

### Authentication and permissions

-   A super admin can sign in and reach the admin dashboard.
-   A teacher can sign in and reach the teacher dashboard.
-   Public users cannot create or elevate themselves to super admin.
-   A teacher cannot read or modify another teacher's restricted data by
    changing a URL, document ID, or client-side state.
-   Disabled or unprovisioned accounts cannot access protected
    application data.

### Academic setup and CRUD

-   The super admin can create, read, update, and deactivate/delete
    supported academic records and assignments.
-   Teacher dashboards reflect assignment changes without retaining
    stale access.
-   Deleting or deactivating referenced records does not silently orphan
    historical records.

### Student import

-   A valid Excel file can be previewed, validated, and imported.
-   Invalid headers, duplicate identifiers, and invalid rows produce
    actionable messages.
-   Re-importing does not create duplicate student records.
-   The imported roster is isolated to the selected academic context.

### CAGS and AI

-   The six in-scope screens are accessible and use the correct academic
    context.
-   COs through CO-4 and approved PO/PSO definitions are selectable.
-   The AI endpoint returns schema-valid suggestions or a clear error.
-   Unknown outcome IDs and malformed model output are rejected.
-   A teacher must approve or edit a suggestion before it becomes the
    saved official mapping.
-   Mapping calculations are implemented only after their rules have
    been verified.

### Timetable, attendance, and reporting

-   The super admin can maintain timetable entries.
-   An assigned teacher can record and correct attendance for an
    authorized scheduled class.
-   Duplicate lecture sessions are prevented or handled by a documented
    correction workflow.
-   Saved attendance updates the correct monthly summary.
-   Teaching-plan suggestions are reviewable and not falsely marked
    complete.
-   Reports display only authorized contexts and do not invent missing
    values.

### Deployment and operational safety

-   The application runs locally with documented environment variables.
-   The application deploys on Vercel.
-   The OpenAI key is not present in the browser bundle or client
    network configuration.
-   Firestore Security Rules and server-side authorization have been
    tested with both allowed and denied operations.
-   The implementation includes useful error states and does not report
    failed operations as successful.

## 11. Instructions to Antigravity

Treat this document as the product contract. Before implementing
business logic, inspect the supplied workbook and outcome PDF, confirm
the six in-scope tab names, and identify the exact fields and formulas
needed for those tabs. Record unresolved academic rules as explicit
questions; do not invent them.

Implement in small, verifiable milestones. At the end of each milestone,
run the relevant tests and report:

1.  What was implemented.
2.  Which files were added or changed.
3.  How to run or inspect it.
4.  Which verification steps passed or failed.
5.  Any unresolved assumptions or blockers.

Do not mark a feature complete merely because its UI exists. Completion
requires a persisted operation, correct authorization, and a
demonstrated verification path.
