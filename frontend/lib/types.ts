export type Difficulty = "easy" | "medium" | "hard";

export type Skill =
  | "DSA"
  | "System Design"
  | "SQL"
  | "OOP"
  | "Behavioral"
  | "Communication";

export interface Evaluation {
  score: number;
  feedback: string;
  keywords_matched: string[];
  keywords_missing: string[];
}

export interface QuestionPayload {
  question: string;
  difficulty: Difficulty;
  skills_tested: string[];
  evaluation: Evaluation | null;
}

export interface StartSessionResponse {
  session_id: string;
  question: QuestionPayload;
}

export type AnswerResponse =
  | {
      done: false;
      turn_number: number;
      evaluation: Evaluation | null;
      next_question: QuestionPayload;
    }
  | { done: true; session_id: string };

export interface RoadmapWeek {
  week: number;
  focus: string;
  resources: string[];
}

export interface ReportResponse {
  skill_scores: Record<string, number>;
  weak_areas: string[];
  roadmap: RoadmapWeek[];
}

export interface ApiError {
  error: string;
  code: string;
}

export const ALLOWED_ROLES = [
  "SDE Intern",
  "Backend Engineer",
  "Frontend Engineer",
  "Full Stack Engineer",
  "ML Engineer",
  "Data Analyst",
  "DevOps Engineer",
] as const;

export type Role = (typeof ALLOWED_ROLES)[number];
