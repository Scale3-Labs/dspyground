#!/usr/bin/env node

import { Command } from "commander";
import { devCommand } from "./dev.js";
import { initCommand } from "./init.js";

const program = new Command();

program
  .name("dspyground")
  .description("DSPyGround - Optimize and test your AI agents")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize DSPyGround in the current directory")
  .action(initCommand);

program
  .command("dev")
  .description("Start the DSPyGround development server")
  .action(devCommand);

program.parse();
