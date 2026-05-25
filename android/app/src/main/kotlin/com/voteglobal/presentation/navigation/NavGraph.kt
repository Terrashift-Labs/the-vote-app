package com.TheVoteApp.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.TheVoteApp.presentation.auth.AuthScreen
import com.TheVoteApp.presentation.policies.PoliciesScreen
import com.TheVoteApp.presentation.result.ResultScreen
import com.TheVoteApp.presentation.vote.VoteScreen

sealed class Screen(val route: String) {
    object Auth : Screen("auth")
    object Policies : Screen("policies/{countryCode}") {
        fun createRoute(countryCode: String) = "policies/$countryCode"
    }
    object Vote : Screen("vote/{policyId}") {
        fun createRoute(policyId: String) = "vote/$policyId"
    }
    object Result : Screen("result/{policyId}") {
        fun createRoute(policyId: String) = "result/$policyId"
    }
}

@Composable
fun TheVoteAppNavGraph(
    navController: NavHostController = rememberNavController()
) {
    NavHost(navController = navController, startDestination = Screen.Auth.route) {

        composable(Screen.Auth.route) {
            AuthScreen(
                onAuthenticated = { countryCode ->
                    navController.navigate(Screen.Policies.createRoute(countryCode)) {
                        popUpTo(Screen.Auth.route) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = Screen.Policies.route,
            arguments = listOf(navArgument("countryCode") { type = NavType.StringType })
        ) {
            PoliciesScreen(
                onPolicySelected = { policyId ->
                    navController.navigate(Screen.Vote.createRoute(policyId))
                },
                onResultsSelected = { policyId ->
                    navController.navigate(Screen.Result.createRoute(policyId))
                }
            )
        }

        composable(
            route = Screen.Vote.route,
            arguments = listOf(navArgument("policyId") { type = NavType.StringType })
        ) {
            VoteScreen(
                onVoteComplete = { txHash ->
                    navController.popBackStack()
                },
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.Result.route,
            arguments = listOf(navArgument("policyId") { type = NavType.StringType })
        ) {
            ResultScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }
    }
}
