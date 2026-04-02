export interface AnnouncementSummaryResponse {
  totalMessagesToday: number;
  analyzedMessagesToday: number;
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  byType?: Record<string, number>;
  byFacility?: Record<string, number>;
}

export interface AnnouncementCandidate {
  id: number;
  title: string;
  candidateType: string;
  status: string;
  facilityName: string;
  groupName?: string;
  groupId?: string;
  confidence: number | string;
  summary?: string;
  detectedAt: string;
  scopeType?: string;
  recommendedAction?: string;
  badExample?: string;
  recommendedReply?: string;
  extractedJson?: unknown;
  originalText?: string;
  displayName?: string;
  userId?: string;
  isFromSupervisor?: string | boolean;
  appliesToRoles?: string[];
  reasoningTags?: string[];
  startAt?: string | null;
  endAt?: string | null;
  sourceMessage?: {
    text: string;
    sentAt: string;
    isFromSupervisor?: boolean;
    groupName?: string;
    facilityName?: string;
  };
}

export interface AnnouncementCandidateDetail extends AnnouncementCandidate {
  reviews?: AnnouncementReview[];
}

export interface AnnouncementReview {
  id: number;
  candidateId: number;
  action: string;
  comment?: string;
  reviewedBy?: string;
  reviewedAt: string;
}

export interface AnnouncementWeeklyDay {
  date: string;
  totalMessages?: number;
  analyzedMessages?: number;
  candidatesCreated?: number;
  approved?: number;
  rejected?: number;
  highConfidenceCount?: number;
}

export interface AnnouncementWeeklyReportResponse {
  days: AnnouncementWeeklyDay[];
  summary?: {
    totalAnalyzed?: number;
    totalCandidates?: number;
    totalApproved?: number;
    totalRejected?: number;
  };
}

export interface AnnouncementCandidatesResponse {
  candidates: AnnouncementCandidate[];
  items?: AnnouncementCandidate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

export interface AnnouncementFilters {
  keyword?: string;
  status?: string;
  candidateType?: string;
  facilityName?: string;
  groupId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  vipFocus?: boolean;
}

export const CANDIDATE_TYPES = ["rule", "notice", "campaign", "discount", "script", "ignore"] as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[number];

export const CANDIDATE_STATUSES = ["pending_review", "approved", "rejected", "ignored", "vip_chat"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const TYPE_LABELS: Record<string, string> = {
  rule: "規則/SOP",
  notice: "通知公告",
  campaign: "活動",
  discount: "優惠折扣",
  script: "標準說詞",
  ignore: "閒聊",
};

export const STATUS_LABELS: Record<string, string> = {
  pending_review: "待審核",
  approved: "已核准",
  rejected: "已退回",
  ignored: "已忽略",
  vip_chat: "⭐ VIP閒聊",
};
