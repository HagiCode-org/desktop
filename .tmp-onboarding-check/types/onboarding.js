/**
 * Onboarding wizard types and interfaces
 */
/**
 * Onboarding step enumeration
 */
export var OnboardingStep;
(function (OnboardingStep) {
    OnboardingStep[OnboardingStep["Welcome"] = 0] = "Welcome";
    OnboardingStep[OnboardingStep["LegalConsent"] = 1] = "LegalConsent";
    OnboardingStep[OnboardingStep["SharingAcceleration"] = 2] = "SharingAcceleration";
    OnboardingStep[OnboardingStep["Download"] = 3] = "Download";
})(OnboardingStep || (OnboardingStep = {}));
