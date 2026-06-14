{
  "targets": [
    {
      "target_name": "hagicode_store_purchase_addon",
      "sources": [
        "addon.cpp"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!(node -p \"process.env.HAGICODE_CPPWINRT_INCLUDE_DIR || ''\")"
      ],
      "defines": [
        "NAPI_CPP_EXCEPTIONS",
        "NAPI_VERSION=8",
        "WIN32_LEAN_AND_MEAN",
        "NOMINMAX"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "conditions": [
        [
          "OS==\"win\"",
          {
            "libraries": [
              "WindowsApp.lib",
              "RuntimeObject.lib",
              "Ole32.lib"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "AdditionalOptions": [
                  "/std:c++20",
                  "/await:strict"
                ],
                "ExceptionHandling": 1
              }
            }
          }
        ]
      ]
    }
  ]
}
