<img width="1000" height="309" alt="image" src="https://raw.githubusercontent.com/blaze-sanecki/foundry-dolmenwood/master/assets/logo.webp" />

# Dolmenwood
This is a Foundry VTT game system implementing the Dolmenwood ruleset.

The system is still in development, but most major features are already implemented and automated. Please be aware that most of the actual content (items, monsters, spells) is not available at the moment, and will be provided in a separate module in the near future. You can however add your own custom items and try out the system in its current (Early Access) state.

Simply use this manifest URL to install it: https://raw.githubusercontent.com/NecroticGnome/dolmenwood-foundry-system/main/system.json

# OSE to Dolmenwood conversion

Thera are two macros in the scripts folder that let you export your OSE world content and import it into a Dolmenwood world.

1. In your OSE world add and execute this macro: https://github.com/NecroticGnome/dolmenwood-foundry-system/blob/main/scripts/ose-export-macro.js
2. You should get a .json file after you run the macro
3. In your Dolmenwood world add and execute this macro: https://github.com/NecroticGnome/dolmenwood-foundry-system/blob/main/scripts/ose-import-macro.js
4. Point the dialog to the downloaded .json file and import

This procedure should convert all actors and items from your world into Dolmenwood format as well as import the scenes and journals.

The export script **DOES NOT** process the data found in compendia - only what's currently imported into your world data. In other words - **be sure to import any compendia you need transfered before exporting**.

Also, any image path references are kept as-is so keep in mind that removing OSE data would break any portraits/tokens used by imported actors.
