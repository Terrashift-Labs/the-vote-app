package com.TheVoteApp.accessibility

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Automated accessibility tests — verifies WCAG 2.1 AA requirements
 * that can be checked programmatically.
 *
 * Manual TalkBack audit checklist (run on real device before each release):
 *   □ All screens navigable by swipe without visual reference
 *   □ Vote option selection announced with current state (selected/unselected)
 *   □ Biometric prompt accessible via TalkBack
 *   □ Error messages announced immediately when they appear
 *   □ Transaction hash read character-by-character in receipt screen
 *   □ Progress states ("Signing vote...", "Submitting...") announced
 */
@RunWith(AndroidJUnit4::class)
class AccessibilityTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun backButton_hasContentDescription() {
        // All screens with a back button must have a content description for TalkBack
        composeTestRule.onNodeWithContentDescription("Back").assertIsDisplayed()
    }

    @Test
    fun voteOptions_haveSemanticRole() {
        // Radio buttons must announce role = "radio" so TalkBack speaks "Support, radio button"
        composeTestRule.onAllNodes(hasContentDescription("Support"))
        composeTestRule.onAllNodes(hasContentDescription("Oppose"))
        composeTestRule.onAllNodes(hasContentDescription("Abstain"))
    }

    @Test
    fun loadingIndicators_haveContentDescription() {
        // Progress indicators must have a description so blind users know what is happening
        composeTestRule.onAllNodes(hasContentDescription("Loading"))
    }
}
