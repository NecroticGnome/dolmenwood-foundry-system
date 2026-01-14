import globals from "globals"
import pluginJs from "@eslint/js"

export default [
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.jquery
			},
			sourceType: "module"
		}
	},
	pluginJs.configs.recommended,
	{
		rules: {
			"no-unused-vars": "warn",
			"no-undef": "warn",
			"semi": ["error", "never"],
			"indent": ["warn", "tab"],
			"brace-style": ["warn", "1tbs"]
		}
	}
]
