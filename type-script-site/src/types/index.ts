// src/types/index.ts

// User related types
export interface User {
  name: string;
  email: string;
  password: string;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

// Forgot Password types
export interface ForgotPasswordState {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
  step: number; // 1: Email, 2: OTP, 3: Password Reset
  error: string;
  success: string;
  generatedOtp: string;
  loading: boolean;
  otpExpiry: Date | null;
  timeRemaining: number;
}

// API related types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  messageId?: string;
  error?: string;
}

export interface OtpRequestBody {
  email: string;
  otp: string;
}

// Component Props types
export interface ErrorMessageProps {
  message: string;
}

export interface SuccessMessageProps {
  message: string;
}

export interface FormInputProps {
  type: string;
  id: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  className: string;
  disabled?: boolean;
  maxLength?: string;
  autoComplete?: string;
}

// Navigation types
export interface NavigateFunction {
  (to: string): void;
}

// Local Storage types
export interface LocalStorageUser {
  name: string;
  email: string;
  password: string;
}

// Event types
export interface FormSubmitEvent extends React.FormEvent<HTMLFormElement> {}
export interface InputChangeEvent extends React.ChangeEvent<HTMLInputElement> {}
export interface ButtonClickEvent extends React.MouseEvent<HTMLButtonElement> {}
export interface KeyboardEvent extends React.KeyboardEvent<HTMLInputElement> {}

// OTP related types
export interface OtpInputProps {
  index: number;
  value: string;
  onChange: (e: InputChangeEvent, index: number) => void;
  onKeyDown: (e: KeyboardEvent, index: number) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}

// Timer types
export interface TimerState {
  timeRemaining: number;
  isExpired: boolean;
  formattedTime: string;
}