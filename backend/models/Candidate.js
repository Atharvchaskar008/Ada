import mongoose from 'mongoose';

const CandidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    githubUsername: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'AUDITED', 'REJECTED', 'APPROVED'],
      default: 'AUDITED',
    },
    latestDecision: { type: String, enum: ['REJECT', 'PROCEED', 'WORTHY'] },
    auditsCount: { type: Number, default: 1 },
    topSkillsVerified: [{ type: String }],
    topSkillsUnverified: [{ type: String }],
  },
  { timestamps: true }
);

export const Candidate = mongoose.model('Candidate', CandidateSchema);
