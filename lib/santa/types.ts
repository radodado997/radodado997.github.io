export type RoomStatus = "open" | "started";
export type MemberRole = "admin" | "member";

export type Room = {
  id: string;
  name: string;
  invite_code: string;
  status: RoomStatus;
  participant_count: number;
  claimed_count: number;
  drawn_count: number;
  budget_pln: number | null;
};

// Wynik list_participants: celowo bez user_id, więc nie da się powiązać osoby z kontem.
export type Participant = {
  id: string;
  display_name: string;
  is_claimed: boolean;
  is_mine: boolean;
};
