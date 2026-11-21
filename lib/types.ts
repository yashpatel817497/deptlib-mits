export type Role = "Admin" | "Student";
export type UserStatus = "Active" | "Suspended";
export type Availability = "Available" | "Issued" | "Lost";
export type LoanStatus = "Issued" | "Returned" | "Lost";
export type PaymentStatus = "Pending" | "Completed" | "Failed";
export type RequestStatus = "Pending" | "Approved" | "Rejected";
export type IssueRequestStatus = "Pending" | "Approved" | "Rejected";
export type ReservationStatus = "Waiting" | "Ready" | "Fulfilled" | "Cancelled";

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  adminId?: number;
  studentId?: number;
  departmentName?: string;
  fineBalance?: number;
}

export interface DepartmentDTO {
  deptId: number;
  deptName: string;
  bookCount: number;
  issuedCount: number;
  createdAt: string;
}

export interface ReservationBriefDTO {
  reservationId: number;
  bookId: number;
  status: ReservationStatus;
  position: number;
  createdAt: string;
  notifiedAt: string | null;
}

export interface ReservationDTO extends ReservationBriefDTO {
  title: string;
  author: string;
  studentId: number;
  studentName: string;
}

export interface BookDTO {
  bookId: number;
  title: string;
  author: string;
  isbn: string;
  category: string;
  /** null means the cover follows the book id, as it always has. */
  coverVariant: number | null;
  deptId: number;
  departmentName: string;
  availabilityStatus: Availability;
  totalCopies: number;
  availableCopies: number;
  replacementCost: number;
  averageRating: number | null;
  reviewCount: number;
  issueCount: number;
  createdAt: string;
  /** Present on student responses: this student's queue entry for the title. */
  myReservation?: ReservationBriefDTO | null;
  /** A returned copy is being held for another student in the queue. */
  holdForOther?: boolean;
}

export interface ReviewDTO {
  reviewId: number;
  bookId: number;
  studentId: number;
  studentName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface BookDetailsDTO extends BookDTO {
  reviews: ReviewDTO[];
  activeLoan: {
    transactionId: number;
    studentId: number;
    studentName: string;
    dueDate: string;
  } | null;
}

export interface LoanDTO {
  transactionId: number;
  bookId: number;
  studentId: number;
  studentName: string;
  title: string;
  author: string;
  departmentName: string;
  issueDate: string;
  dueDate: string;
  returnDate: string | null;
  fineCalculated: number;
  renewalCount: number;
  status: LoanStatus;
  daysOverdue: number;
  fineIfReturnedToday: number;
}

export interface PaymentDTO {
  paymentReferenceId: string;
  studentId: number;
  studentName?: string;
  amount: number;
  paymentStatus: PaymentStatus;
  method: string;
  timestamp: string;
}

export interface AnnouncementDTO {
  announcementId: number;
  message: string;
  author: string;
  createdAt: string;
}

export interface RequestDTO {
  requestId: number;
  title: string;
  author: string;
  deptId: number;
  departmentName: string;
  studentId: number;
  studentName: string;
  status: RequestStatus;
  reviewNote: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface IssueRequestDTO {
  requestId: number;
  studentId: number;
  studentName: string;
  fullName: string;
  enrollmentNo: string;
  departmentName: string;
  semester: string;
  bookId: number;
  title: string;
  author: string;
  bookDepartment: string;
  availableCopies: number;
  status: IssueRequestStatus;
  reviewNote: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SettingsDTO {
  fineRate: number;
  graceDays: number;
  maxIssueLimit: number;
  borrowDays: number;
  lostPenalty: number;
  maxUnpaidFine: number;
}

export interface HistoryEntry {
  kind: "Loan" | "Return" | "Lost" | "Payment" | "Activity" | "Request" | "Review";
  title: string;
  detail: string;
  date: string;
  amount?: number;
}

export interface AdminStudentDTO extends PublicUser {
  fullName: string;
  enrollmentNo: string;
  semester: string;
  email: string;
  phone: string;
  activeLoans: number;
  overdueLoans: number;
  totalFinesPaid: number;
}

export interface ReportDTO {
  totals: {
    books: number;
    availableBooks: number;
    issuedBooks: number;
    lostBooks: number;
    departments: number;
    students: number;
    activeStudents: number;
    activeLoans: number;
    overdueLoans: number;
    finesCollected: number;
    outstandingFines: number;
  };
  departments: Array<{ deptId: number; deptName: string; books: number; issued: number }>;
  topBooks: Array<{ bookId: number; title: string; author: string; issueCount: number }>;
  recentTransactions: LoanDTO[];
  overdue: LoanDTO[];
}

export interface DueAlertDTO {
  transactionId: number;
  bookId: number;
  title: string;
  dueDate: string;
  /** Negative when overdue, 0 when due today, positive days otherwise. */
  daysUntilDue: number;
  overdue: boolean;
}

export interface StudentDashboardDTO {
  stats: {
    activeLoans: number;
    overdueLoans: number;
    returnedLoans: number;
    fineBalance: number;
    maxIssueLimit: number;
    pendingRequests: number;
    reservations: number;
  };
  loans: LoanDTO[];
  reservations: ReservationDTO[];
  dueAlerts: DueAlertDTO[];
  fineRate: number;
  /** Self-service issue requests and their approval state. */
  issueRequests: IssueRequestDTO[];
}
