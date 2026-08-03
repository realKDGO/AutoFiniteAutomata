# AutoFA
> Automatic Finite Automata Generator

AutoFA is a web-based application that automatically generates **Deterministic Finite Automata (DFA)** and **Non-deterministic Finite Automata (NFA)** from user-defined language conditions.

The goal of the project is to help students, educators, and anyone learning Automata Theory visualize finite automata without manually creating state diagrams and transition tables.

This project is planned as a **web application** first and later expanded into a **mobile application**.

---

# Project Goal

Instead of manually solving DFA/NFA problems, users simply define the language conditions such as:

- Starts with
- Ends with
- Contains
- Does Not Contain
- Exactly
- At Least
- At Most

The application automatically generates:

- DFA/NFA State Diagram
- Transition Table
- State Descriptions
- Input Simulation
- Accepted Examples
- Rejected Examples

---

# Objectives

- Help students understand DFA and NFA.
- Reduce the time required to manually draw automata.
- Provide an educational visualization tool.
- Support learning through simulation.

---

# Target Users

- Computer Science Students
- IT Students
- Professors
- Automata Theory Learners
- Self-learners

---

# Tech Stack

## Frontend

- React
- Tailwind CSS
- React Flow (State Diagram)
- Framer Motion
- React Router

---

## Backend

- Node.js
- Express.js

---

## Database (Optional)

- Supabase

Used only for:

- User Accounts
- Saved Projects
- History
- Cloud Storage

The generator itself should work without a database.

---

# Folder Structure

```
AutoFA
│
├── client/
│
├── server/
│
├── docs/
│
├── README.md
│
└── package.json
```

---

# Development Roadmap

## Phase 1
Core Generator

- DFA Generation
- NFA Generation
- Transition Table
- Diagram Rendering

---

## Phase 2

Simulation

- Input String Simulation
- Accepted / Rejected Result
- Step-by-Step Traversal

---

## Phase 3

Export

- PNG
- PDF
- JSON

---

## Phase 4

Advanced Features

- DFA Minimization
- NFA → DFA Conversion
- Regex → NFA
- DFA Validation

---

## Phase 5

Authentication

- Login
- Save Projects
- Project History

---

## Phase 6

Mobile Version

Flutter or React Native

---

# Application Flow

```
Home

↓

Select Automata

↓

Choose Alphabet

↓

Create Condition(s)

↓

Generate

↓

Result
```

---

# Generator Flow

```
User Input

↓

Validation

↓

Rule Parser

↓

Automata Generator

↓

Transition Table Generator

↓

Diagram Generator

↓

Simulation Generator

↓

Output
```

---

# UI Flow

## Home

- Introduction
- Generate Button

---

## Generate Page

### Step 1

Select Automata

```
○ DFA

○ NFA
```

---

### Step 2

Alphabet

```
○ {0,1}

○ {a,b}

○ Custom
```

Custom Example

```
{a,b,c}
```

---

### Step 3

Conditions

The user adds one or more conditions.

Example

```
Starts With

[ 10 ]
```

Another Example

```
Contains

[110]
```

Another Example

```
Ends With

[01]
```

Another Example

```
Exactly

[2] Ones
```

Another Example

```
Does Not Contain

[110]
```

Users may add multiple conditions.

Example

```
Starts With

[10]

AND

Ends With

[01]
```

Example

```
Contains

[101]

AND

Does Not Contain

[00]
```

---

### Step 4

Generate

```
Generate DFA
```

or

```
Generate NFA
```

---

# Result Page

The application generates

## Language

Example

```
DFA over {0,1}

Starts with 10

Ends with 01
```

---

## State Diagram

Interactive Diagram

Features

- Zoom
- Drag
- Pan
- Highlight Traversal

---

## Transition Table

Example

| State | 0 | 1 |
|------|------|------|
| A | B | A |
| B | C | A |
| C | B | C |

---

## State Explanation

Example

```
State A

Initial State

No conditions matched yet.
```

```
State B

Detected prefix 1.
```

```
State C

Accepting State.
```

---

## Accepted Examples

```
101

1001

101101
```

---

## Rejected Examples

```
111

001

1100
```

---

## Input Simulation

User Input

```
101001
```

Output

```
Current State

A

↓

Read 1

↓

B

↓

Read 0

↓

C

↓

Read 1

↓

C

↓

Accepted
```

---

# Features

## Core Features

- DFA Generator
- NFA Generator
- State Diagram
- Transition Table
- Accepted Examples
- Rejected Examples
- Input Simulator

---

## Educational Features

- State Description
- State Explanation
- Traversal Animation
- Final State Highlight
- Dead State Highlight

---

## Advanced Features

- Save Project
- Export PNG
- Export PDF
- Export JSON
- Share Link

---

## Future Features

- DFA Minimizer
- NFA → DFA Converter
- Regex → NFA
- Quiz Generator
- Exercise Generator
- AI Explanation
- Dark Mode
- Mobile App

---

# UI Design

Theme

Modern

Minimal

Educational

Inspired by:

- Material Design 3
- VS Code
- Excalidraw

---

Primary Colors

- Blue
- White
- Gray

Dark Mode

Supported

---

Typography

- Inter
- Poppins

---

Icons

Lucide React

---

# Design Principles

- Beginner Friendly
- Educational First
- Clean Interface
- Minimal Clicks
- Responsive
- Mobile Friendly

---

# Algorithm Overview

The generator follows four major steps.

## 1.

Parse user conditions.

Example

```
Starts With

10
```

---

## 2.

Generate states.

---

## 3.

Generate transitions.

---

## 4.

Identify accepting states.

---

# MVP (Minimum Viable Product)

The first release should support:

- DFA
- NFA
- Starts With
- Ends With
- Contains
- Transition Table
- Diagram
- Simulation

No login required.

---

# Long-Term Vision

AutoFA aims to become an educational platform for Automata Theory by combining automatic automata generation, visualization, simulation, and interactive learning tools in one application. Future releases will expand beyond DFA and NFA to support more advanced automata concepts, regular expressions, conversions, minimization, and guided learning modules.