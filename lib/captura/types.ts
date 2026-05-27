export type HoleNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18;

export type HoleScores = Record<HoleNumber, number | null>;

export type GroupCapturePlayer = {
  entryId: string;
  playerId: string;
  name: string;
  initials: string;
  scores: HoleScores;
};

export type GroupCapturePayload = {
  groupId: string;
  roundId: string;
  tournamentId: string | null;
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  tournamentName: string | null;
  players: GroupCapturePlayer[];
};
