# Froth segmentation failure modes

Dry-froth lamellae can be thin and dark; wet froth can suppress them. Glare
creates false interiors, blur erases ridges, dense fine bubbles challenge
resolution, and frame truncation distorts morphometry. A method may achieve a
high boundary score while catastrophically merging bubbles, or preserve count
while shifting the size distribution.

Classical watershed variants make these mechanisms inspectable. Learned
boundary/distance models target ambiguous markers. StarDist is constrained by
star convexity. Detector and foundation models trade domain fit for broader
priors. Temporal propagation can maintain masks while corrupting identities.
The product therefore exposes method-specific failures rather than compressing
them into one rank.
