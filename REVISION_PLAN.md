

## GOAL 1: Enhance Public Viewing AI Recommendations and Visitor Engagement

### 1.7. Implement Public User Registration and Authentication

Implement a secure public user authentication system that allows visitors to create an account or sign in before submitting establishment ratings and reviews.

Support the following authentication methods:

- Google Sign-In using OAuth.
- Email and password registration.
- Email verification.
- Sign-in and sign-out.
- Forgot password and password recovery.

Reuse the existing Supabase Authentication infrastructure where appropriate.

Public users must have a separate role from Tourism Officers, establishment operators, and system administrators.

Public user accounts must not have access to administrative dashboards, private tourism reports, or restricted establishment information.

### 1.8. Implement Verified Account Requirements

Require authenticated and verified accounts before allowing users to submit ratings and reviews.

Apply the following rules:

- Unauthenticated visitors may browse establishments, view existing published reviews, and receive personalized recommendations.
- Visitors must sign in or register before submitting a rating or review.
- Email-based accounts must complete email verification.
- Google-authenticated accounts must satisfy the authentication provider's verified identity requirements.
- Unverified accounts must not be permitted to submit ratings and reviews.
- Every submitted review must be associated with a unique authenticated user ID.
- Account ownership and review ownership must be validated on the backend.

The objective is to prevent unrestricted anonymous ratings and establish accountability for submitted feedback.

Account verification confirms control of an authenticated account or email address. It does not automatically prove that a reviewer has personally visited an establishment.

### 1.9. Implement Establishment Ratings and Reviews

Allow verified public users to provide feedback for registered hotels and resorts within Balayan.

Each review should support:

- Establishment identifier.
- Authenticated user identifier.
- Reviewer display name.
- Star rating from 1 to 5.
- Written review.
- Submission date.
- Last updated date.
- Moderation status.

Use the following rating scale:

| Rating | Interpretation |
|---|---|
| 5 stars | Excellent |
| 4 stars | Good |
| 3 stars | Satisfactory |
| 2 stars | Poor |
| 1 star | Very Poor |

Require a star rating while allowing the written review to remain optional.

Validate all submitted information before saving it to the database.

### 1.10. Prevent Duplicate and Manipulated Reviews

Implement safeguards to maintain the credibility of establishment feedback.

- Allow only one active rating and review per verified account per establishment.
- Allow users to edit or delete their own reviews.
- Prevent users from modifying another user's review.
- Prevent duplicate reviews through database-level constraints.
- Apply reasonable submission rate limits.
- Detect suspicious repetitive submissions.
- Prevent unauthorized manipulation of rating values.
- Validate rating values on both the frontend and backend.
- Prevent establishment operators from rating their own establishments where account relationships can be reliably identified.
- Allow suspicious or inappropriate reviews to be flagged for moderation.

Do not assume that account verification alone eliminates fake reviews or rating manipulation.

### 1.11. Implement Review Moderation

Allow authorized Tourism Officers or designated administrators to manage inappropriate, fraudulent, irrelevant, or abusive reviews.

Support applicable moderation statuses:

- Pending Review
- Published
- Flagged
- Rejected
- Hidden

Allow authorized moderators to:

- Review flagged submissions.
- Approve or reject reviews according to a documented moderation policy.
- Hide inappropriate content.
- Record moderation reasons.
- Investigate suspicious rating activity.
- Maintain an audit trail of moderation actions.

Do not remove legitimate negative reviews solely because they negatively affect an establishment's rating.

Establishment operators must not be allowed to directly delete negative reviews or manipulate their establishment's average rating.

### 1.12. Enhance Public Establishment Profiles

Display the following customer feedback information on each establishment's public profile:

- Average star rating.
- Total number of published ratings.
- Rating distribution from 1 to 5 stars.
- Positive rating percentage.
- Published customer reviews.
- Reviewer display name.
- Review submission date.
- Verified Account indicator.

Include a Write a Review button.

When an unauthenticated user selects Write a Review, display the following message:

"To provide a rating or review, please create an account or sign in using Google or email. Only verified accounts can submit feedback to help maintain the reliability and accountability of establishment ratings."

After successful authentication, return the user to the establishment profile or review form.

Do not display reviewers' private email addresses, authentication identifiers, or other confidential account information publicly.

### 1.13. Implement Rating and Review Calculations

Calculate all rating statistics deterministically using valid, published, and eligible reviews.

**Average Rating**

Average Rating = Sum of Published Star Ratings ÷ Total Number of Published Ratings

**Positive Rating Percentage**

Positive Rating Percentage = (Number of 4-star and 5-star Ratings ÷ Total Number of Published Ratings) × 100

**Rating Distribution**

Calculate the number and percentage of published ratings for each star level.

When no published ratings exist, display "No ratings yet" rather than assigning a zero-star rating.

When a review is edited, deleted, rejected, or hidden, update the corresponding rating statistics.

### 1.14. Integrate Ratings with Public Recommendation Results

Display available customer ratings alongside recommended establishments.

However, preference matching must remain the primary basis for public recommendations.

An establishment with a higher rating must not automatically be recommended if it fails the visitor's selected location, environment, establishment type, or visit type requirements.

Where sufficient reliable rating information exists, allow users to sort matching establishments by:

- Best preference match.
- Highest average rating.
- Most reviewed.
- Establishment name.

Ratings may serve as a secondary ranking criterion among establishments satisfying the same visitor preferences.

Establishments without reviews must not automatically be excluded from preference-based recommendations.

### 1.15. Implement Public User Profile Management

Provide a simple public user account page containing:

- Display name.
- Email address.
- Account verification status.
- Authentication method.
- Submitted ratings and reviews.
- Edit or delete own reviews.
- Account settings.
- Sign-out option.
- Account deletion or appropriate account removal request mechanism.

Avoid collecting unnecessary personal information.

Implement appropriate privacy notices explaining how account and review information is collected, stored, and used.

### Expected Outcome

A secure and accountable public feedback system that allows verified users to submit ratings and reviews while preserving unrestricted public access to establishment information and personalized recommendations.

### Acceptance Criteria

- Public visitors can browse without creating an account.
- Visitors can register using email or sign in using Google.
- Only authenticated and verified accounts can submit ratings and reviews.
- Every review is associated with an authenticated user.
- Duplicate ratings from the same account for the same establishment are prevented.
- Users can manage their own reviews.
- Unauthorized review modification is prevented.
- Rating calculations are accurate.
- Review moderation is available to authorized personnel.
- Private account information is protected.
- Public recommendations continue to prioritize visitor preferences.

---

# Additional Requirements for GOAL 3: Establishment Performance Scoring and Ranking Dashboard

## 3.14. Integrate Verified Customer Ratings and Reviews

Use the newly implemented public rating and review system as a potential source of customer satisfaction information for establishment performance assessment.

Calculate the following indicators:

- Average published customer rating.
- Total published ratings.
- Positive rating percentage.
- Rating distribution.
- Customer satisfaction score.
- Historical rating changes.
- Recurring feedback themes, where sufficient written reviews exist.

Do not count rejected, hidden, duplicate, fraudulent, or otherwise ineligible reviews in official performance calculations.

## 3.15. Establish Customer Satisfaction Ranking Eligibility

Do not automatically include every establishment's customer rating in its official performance score.

Consider:

- Number of eligible reviews.
- Account verification.
- Review moderation status.
- Review submission period.
- Potential rating manipulation.
- Availability of comparable feedback across establishments.

Establish a configurable minimum review requirement or an appropriate review-count adjustment.

For example, an establishment with one five-star rating should not automatically be ranked above an establishment with hundreds of verified ratings based solely on average rating.

Establishments with insufficient reviews should display "Insufficient Customer Feedback" rather than receiving an automatic zero score.

Continue using the initial performance model until sufficient comparable customer feedback becomes available.

## 3.16. Calculate the Customer Satisfaction Score

Normalize eligible five-star ratings to a 0–100 scale using the proposed formula:

Customer Satisfaction Score = ((Average Rating − 1) ÷ 4) × 100

Use the number of reviews and positive rating percentage as supporting reliability and descriptive indicators.

Avoid independently weighting average ratings, positive rating percentages, and review counts as separate satisfaction indicators without justification, as this may double-count customer feedback.

## 3.17. Integrate Customer Feedback into the Expanded Performance Model

Once sufficient reliable customer feedback and verified accreditation data are available, evaluate the following expanded performance scoring model:

| Indicator | Proposed Weight |
|---|---:|
| Visitor volume | 30% |
| Visitor growth | 20% |
| Reporting compliance | 20% |
| Customer satisfaction | 20% |
| Verified accreditation | 10% |
| Total | 100% |

If accreditation information remains unavailable but sufficient customer feedback becomes available, evaluate an alternative model:

| Indicator | Proposed Weight |
|---|---:|
| Visitor volume | 35% |
| Visitor growth | 25% |
| Reporting completeness | 20% |
| Customer satisfaction | 20% |
| Total | 100% |

All scoring weights are proposed internal system parameters and require validation and approval.

Do not compare establishments using incompatible scoring models within the same official ranking.

Maintain scoring model versions for historical comparisons.

## 3.18. Enhance Establishment Performance Dashboard

Add the following indicators where sufficient customer feedback exists:

- Highest-rated establishment.
- Most-reviewed establishment.
- Highest positive rating percentage.
- Customer satisfaction score.
- Rating distribution.
- Historical customer rating trends.
- Number of establishments with insufficient customer feedback.

Allow Tourism Officers to filter and rank establishments by customer satisfaction indicators.

Clearly distinguish the highest-rated establishment from the establishment with the highest composite performance score.

---

# Additional Requirements for GOAL 4: Anomaly Detection

## 4.8. Implement Review and Rating Anomaly Detection

Where sufficient feedback data exists, identify suspicious patterns such as:

- Unusually large increases in ratings within a short period.
- Repetitive review content.
- Multiple suspicious account submissions.
- Unexpected changes in average ratings.
- Repeated review manipulation attempts.

Flag suspicious observations for human review rather than automatically labeling them as fraudulent.

Document the detection methodology and its limitations.

---

# Additional Requirements for GOAL 5: AI Insights

## 5.8. Generate Customer Feedback Insights

Use verified and eligible customer feedback as an additional source of establishment-level insights.

Generate findings such as:

- Establishments with consistently high customer ratings.
- Establishments with increasing or declining customer satisfaction.
- Establishments with high visitor volume but comparatively low customer ratings.
- Establishments with positive customer feedback but relatively low visitor volume.
- Recurring themes in published written reviews.
- Insufficient review data preventing reliable customer satisfaction assessment.

Gemini must distinguish subjective customer feedback from verified operational facts.

Do not invent customer complaints, establishment conditions, or reasons for declining ratings.

Every AI-generated review insight must reference supporting feedback statistics and relevant published reviews.

Do not expose reviewers' private account information to Gemini.

---

# Additional Requirements for GOAL 6: AI Decision-Support Recommendations

## 6.11. Generate Customer Feedback-Based Recommendations

Generate actionable recommendations based on sufficient verified customer feedback.

Examples:

**High Visitor Volume but Low Customer Satisfaction**

Review recurring customer concerns and coordinate consultations with establishment operators to identify opportunities for service improvement.

**Low Visitor Volume but High Customer Satisfaction**

Assess whether the establishment could benefit from additional promotional exposure through VistaBalayan's public viewing portal and municipal tourism campaigns.

**Declining Customer Satisfaction**

Compare feedback across equivalent periods, investigate recurring concerns, and recommend appropriate service improvement assessments.

**Consistently Positive Customer Feedback**

Consider the establishment for tourism knowledge-sharing activities and investigate practices that may contribute to positive visitor experiences.

**Insufficient Customer Reviews**

Encourage voluntary and unbiased visitor feedback collection without requiring positive ratings or offering incentives exclusively for favorable reviews.

All recommendations must remain advisory and supported by available evidence.

---

# Additional Requirements for GOAL 8: Security and Reliability

Implement appropriate security controls for public accounts and reviews.

- Secure authentication using Supabase Authentication or the existing approved authentication infrastructure.
- Google OAuth configuration.
- Email verification.
- Password recovery.
- Secure session management.
- Row Level Security policies.
- Role-based access control.
- Review ownership validation.
- Database-level duplicate review constraints.
- Backend input validation.
- Protection against malicious review content.
- Rate limiting.
- Moderation audit records.
- Secure handling of personal information.
- Appropriate account deletion and data retention procedures.

Public users must never gain administrative permissions through the registration process.

---

# Additional Requirements for GOAL 9: Testing and Validation

## Public Account Testing

- Email registration.
- Email verification.
- Google Sign-In.
- Invalid authentication credentials.
- Unverified account restrictions.
- Password recovery.
- Session expiration.
- Sign-out.
- Unauthorized administrative access.
- Account deletion.

## Ratings and Reviews Testing

- Unauthenticated review submission.
- Unverified account review submission.
- Verified account review submission.
- Duplicate review prevention.
- Review editing.
- Review deletion.
- Unauthorized review modification.
- Invalid star rating values.
- Review moderation.
- Average rating computation.
- Positive rating percentage computation.
- Rating distribution computation.
- Rating recalculation after review updates.
- Suspicious submission detection.
- Public reviewer privacy.

## Performance Integration Testing

- Establishment with sufficient eligible reviews.
- Establishment with insufficient reviews.
- Establishment with no reviews.
- Establishment with high visitor volume but low customer satisfaction.
- Establishment with low visitor volume but high customer satisfaction.
- Changes in customer satisfaction scores.
- Performance ranking recalculation.
- Missing accreditation information.
- Consistency between scoring model versions.
- Customer feedback-based AI insights.
- Customer feedback-based recommendations.

Verify all implemented functionality and document actual testing results.

---

# Final Implementation Instruction

Integrate public authentication, verified user accounts, ratings, and reviews into the existing VistaBalayan public viewing portal.

The objective is to establish a credible and accountable customer feedback mechanism rather than allowing unrestricted anonymous ratings.

Preserve public access to establishment information and preference-based recommendations without requiring registration.

Require verified authentication only for submitting and managing customer feedback and other account-specific features.

Use eligible customer feedback as an additional source of establishment performance information only when sufficient reliable and comparable data exists.

Document authentication architecture, database changes, security policies, review moderation rules, rating calculations, performance scoring integration, testing results, and remaining limitations.

Preserve all previously established VistaBalayan revision goals.