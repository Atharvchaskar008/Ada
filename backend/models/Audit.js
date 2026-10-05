import mongoose from 'mongoose';

const ClaimSchema = new mongoose.Schema({
  skill: { type: String, required: true },
  claim: { type: String, required: true },
  reality: { type: String, required: true },
  verified: { type: Boolean, required: true },
});

const AuditSchema = new mongoose.Schema(
  {
    candidateName: { type: String, default: 'Candidate' },
    githubUsername: { type: String, required: true },
    decision: {
      type: String,
      enum: ['REJECT', 'PROCEED', 'WORTHY'],
      required: true,
    },
    verifiedCount: { type: Number, default: 0 },
    totalClaimsCount: { type: Number, default: 0 },
    authenticityScore: { type: Number, default: 0 },
    claims: [ClaimSchema],
    gitTelemetry: {
      commitsCount: { type: Number, default: 0 },
      linesCount: { type: Number, default: 0 },
      primaryDomain: { type: String, default: 'General Code' },
      dockerLines: { type: Number, default: 0 },
      reposScanned: [{ type: String }],
    },
  },
  { timestamps: true }
);

export const Audit = mongoose.model('Audit', AuditSchema);
