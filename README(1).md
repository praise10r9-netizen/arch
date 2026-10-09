# ArchPath

> A professional training and progression management platform for architects.

ArchPath is a digital platform designed to track and manage the professional training journey of architects in Malawi — from graduate training through professional training and, eventually, continuing professional development. The first MVP is trainee-first, with a mentor reviewing submitted training records. University and professional body workflows are explicitly deferred.

The system aims to provide a centralized, transparent record of training progress, including placements, supervised work, training hours, courses, mentor approvals, and progression milestones. Until official requirements are confirmed, any targets displayed in the prototype are configurable demonstration values, not eligibility rules.

## Overview

Architectural training involves practical experience across different firms, sites, and areas of practice under the supervision of qualified professionals. ArchPath is intended to bring that journey into one system, giving trainees, mentors, and the relevant professional body a shared view of verified progress.

The initial system is focused on the first two stages of professional training:

1. **Graduate Training** — supervised training following university studies, with progress tracked against defined requirements.
2. **Professional Training** — structured practical training involving office and site work, with required courses and training hours.

Continuing professional development for qualified architects may be incorporated as a later stage.

## Core Features

The initial version is expected to include:

- Trainee and mentor accounts
- Training placement management
- Mentor assignment and supervision
- Training hour logging by category
- Mentor verification of submitted records
- Training targets and progress tracking
- Course completion records
- Trainee progress dashboards
- Eligibility and progression notifications
- Verified records for review by the relevant professional body

## User Roles

### Trainees
- Record training activities and hours
- Track progress toward requirements
- View completed courses and milestones
- Monitor eligibility for the next stage

### Mentors
- Review trainee submissions
- Verify training records
- Supervise trainees and their placements

### Professional Body / Board
- Access verified training records
- Review trainee progress
- Manage or verify progression requirements

### Universities
- Confirm eligibility for trainees entering the professional training pathway

## Project Status

**Current stage:** Trainee-side MVP prototype

The project is being defined with the client. Training requirements, official processes, user responsibilities, and the role of the professional body are still being clarified. The prototype assumes trainee identity and qualification have already been verified; it does not implement verification workflows.

The prototype starts with a trainee workspace for logging experience, reviewing placements and courses, and tracking configurable progress. Mentor accounts and approvals are the next collaboration surface. Board and university users are not part of this MVP.

## Initial Scope

### In Scope for the Trainee MVP

- Trainee workspace with overview and progress summaries
- Training placement records
- Training hour logging by configurable category
- Submission status and mentor feedback fields for logged records
- Course records and a verification document register
- Demo targets clearly identified as configurable and non-official
- A local JSON data file for the prototype

### Excluded from this MVP / Planned for Later

- Real authentication, identity verification, and authorization
- Document file uploads/downloads (register metadata only until access controls exist)
- University workflows or verification
- Professional body / board access, review, and progression workflows
- Examination registration and results
- Hosting course content
- Continuing professional development tracking
- More advanced placement and progression rules

The JSON store at `data/archpath.json` is intended for local, single-instance prototyping only. It is not safe for concurrent multi-instance production use and must be replaced with a transactional database (planned: PostgreSQL) before deployment with real users or documents.

## Documentation

Project documentation and requirements will be added as the system develops.

---

**ArchPath**  
*NxtGen Labs*
