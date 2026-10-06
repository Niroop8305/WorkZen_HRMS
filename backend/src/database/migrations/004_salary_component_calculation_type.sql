-- Payroll Milestone 2: salary components can be configured as a fixed currency
-- amount or a percentage. Existing components default to FIXED, preserving the
-- current fixed-amount behaviour. Percentage resolution is deferred to the
-- payroll calculation engine (Milestone 3); this migration only adds the flag.
USE workzen_hrms;

ALTER TABLE salary_components
  ADD COLUMN calculation_type ENUM('FIXED', 'PERCENTAGE') NOT NULL DEFAULT 'FIXED'
    AFTER component_type;
